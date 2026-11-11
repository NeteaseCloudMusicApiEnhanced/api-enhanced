const logger = require('./logger')
const fs = require('fs')
const path = require('path')

// IP地址转换函数
function ipToInt(ip) {
  const parts = ip.split('.').map(Number)
  const a = (parts[0] << 24) >>> 0
  const b = parts[1] << 16
  const c = parts[2] << 8
  const d = parts[3]
  return a + b + c + d
}

function intToIp(int) {
  return [
    (int >>> 24) & 0xff,
    (int >>> 16) & 0xff,
    (int >>> 8) & 0xff,
    int & 0xff,
  ].join('.')
}

// 解析CIDR格式的IP段
function parseCIDR(cidr) {
  const [ipStr, prefixLengthStr] = cidr.split('/')
  const prefixLength = parseInt(prefixLengthStr, 10)

  const ipInt = ipToInt(ipStr)
  const mask = (0xffffffff << (32 - prefixLength)) >>> 0
  const start = (ipInt & mask) >>> 0
  const end = (start | (~mask >>> 0)) >>> 0
  const count = end - start + 1

  return { start, end, count, cidr }
}

// 从china_ip_ranges.txt加载中国IP段（CIDR格式）
const chinaIPRanges = (function loadChinaIPRanges() {
  try {
    const filePath = path.join(__dirname, '../data/china_ip_ranges.txt')
    const content = fs.readFileSync(filePath, 'utf-8')
    const lines = content
      .split('\n')
      .filter((line) => line.trim() && !line.startsWith('#'))

    const arr = []
    let total = 0

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      if (!line) continue

      const range = parseCIDR(line)
      arr.push(range)
      total += range.count
    }

    // 按IP段大小排序，提高随机选择效率
    arr.sort((a, b) => b.count - a.count)

    // attach total for convenience
    arr.totalCount = total

    // logger.info(
    //   `Loaded ${arr.length} Chinese IP ranges from china_ip_ranges.txt, total ${total} IPs`,
    // )
    return arr
  } catch (error) {
    logger.error('Failed to load china_ip_ranges.txt:', error.message)
    // 返回空数组，generateRandomChineseIP会使用兜底逻辑
    return { totalCount: 0 }
  }
})()
const floor = Math.floor
const random = Math.random
const keys = Object.keys

// 预编译encodeURIComponent以减少查找开销
const encode = encodeURIComponent

// ===================== 解灰增强 =====================
// 通用外链（music.163.com/song/media/outer/url）是网易云对未付费/试听歌下发的
// “假解灰”链接，VIP 歌通常播不了。解灰时应视为无效，继续尝试下一个真源。
const FAKE_UNBLOCK_URL_MARK = 'music.163.com/song/media/outer/url'

// 解灰音源模块遍历顺序：与解灰包 modules 目录的默认（字母序）遍历顺序保持一致，
// 不改变既有音源优先级；在此显式列出，只是为了把“假成功外链则跳过、继续试下一个真源”
// 的判定放进遍历过程中（解灰包自身的遍历无法从外部干预单个音源的结果）。
const UNBLOCK_SOURCE_ORDER = [
  'bugpk',
  'byfuns',
  'ddyr',
  'gdmusic',
  'msls',
  'oi',
  'qijieya',
  'unm',
]

// unm 音源内部的 UNM provider 顺序与范围（沿用此前实测确定的结果）：
//   kuwo > bodian > pyncmd > bilivideo 命中率与响应最佳，其余作兜底。
// 不含 youtube / youtubedl（部署地域访问不通）。
const UNM_PROVIDERS = [
  'kuwo',
  'bodian',
  'pyncmd',
  'bilivideo',
  'kugou',
  'migu',
  'qq',
  'joox',
  'bilibili',
]

// 判断是否为“假解灰”通用外链
function isFakeUnblockUrl(url) {
  return typeof url === 'string' && url.includes(FAKE_UNBLOCK_URL_MARK)
}

// 部分音源（oi / byfuns / ddyr 等）返回 http:// 明文链接。若播放器运行在 HTTPS 页面，
// 浏览器混合内容策略会拦截 http 音频，表现为“播放资源获取失败”。
// 统一升级为 https（126.net 两种协议 token 通用，已实测 https 可正常回源）。
function toHttpsUrl(url) {
  return typeof url === 'string' ? url.replace(/^http:\/\//i, 'https://') : url
}

// 校验单次解灰结果是否为可用真源；可用则顺带把 url 升级为 https，否则返回 null
function normalizeUnblockResult(result) {
  if (!result || result.code !== 200 || !result.data || !result.data.url) {
    return null
  }
  if (isFakeUnblockUrl(result.data.url)) {
    return null
  }
  return {
    ...result,
    data: { ...result.data, url: toHttpsUrl(result.data.url) },
  }
}

// 从解灰包自身的依赖树里解析 UNM server，用于按指定 provider 顺序解灰。
// 走解灰包的路径解析（该依赖由解灰包声明），因此无需为本项目新增依赖；
// 解析失败时返回 null，unm 音源自动退回解灰包自带实现。
let unmMatchCache
function getUnmMatch() {
  if (unmMatchCache !== undefined) return unmMatchCache
  try {
    const utilsEntry =
      require.resolve('@neteasecloudmusicapienhanced/unblockmusic-utils')
    const unmEntry = require.resolve('@unblockneteasemusic/server', {
      paths: [path.dirname(utilsEntry)],
    })
    unmMatchCache = require(unmEntry)
  } catch (error) {
    logger.error(
      'Load UNM server failed, fallback to bundled unm source:',
      error.message,
    )
    unmMatchCache = null
  }
  return unmMatchCache
}

// 按 UNM_PROVIDERS 指定的顺序解灰；不可用、未命中或调用抛错时返回 null，由调用方回退。
// 注意：match() 是真实网络请求，可能超时/抛错，必须兜底，否则会中断整轮遍历。
async function matchByUnmProviders(id) {
  const match = getUnmMatch()
  if (!match) return null
  try {
    const response = await match(id, UNM_PROVIDERS)
    if (!response || !response.url || isFakeUnblockUrl(response.url))
      return null
    return {
      code: 200,
      message: 'success',
      data: { url: toHttpsUrl(response.url), source: 'unm' },
    }
  } catch (error) {
    logger.error(
      'UNM provider match failed:',
      (error && error.message) || error,
    )
    return null
  }
}

/**
 * 解灰匹配（在解灰包 matchID 之上增加：假成功外链过滤、http→https 升级、UNM provider 顺序）
 * @param {Function} matchID 解灰包的 matchID 函数，由调用方注入（本文件不直接依赖解灰包）
 * @param {string} id 歌曲 id
 * @param {string} [source] 显式指定音源；不传则按 UNBLOCK_SOURCE_ORDER 依次尝试
 * @returns {Promise<{code:number,message:string,data:object|null}>} 与 matchID 同构的结果
 */
async function unblockMatch(matchID, id, source) {
  // 显式指定音源时只试该音源，保持 /song/url/match?source=xxx 的既有语义
  if (source) {
    if (source === 'unm') {
      const viaUnm = await matchByUnmProviders(id)
      if (viaUnm) return viaUnm
    }
    const only = normalizeUnblockResult(await matchID(id, source))
    return (
      only || {
        code: 500,
        message: `No available source found from ${source}`,
        data: null,
      }
    )
  }

  for (let i = 0, len = UNBLOCK_SOURCE_ORDER.length; i < len; i++) {
    const name = UNBLOCK_SOURCE_ORDER[i]
    try {
      // unm 走指定的 provider 顺序；直调不可用时回退到解灰包自带的 unm 模块
      if (name === 'unm') {
        const viaUnm = await matchByUnmProviders(id)
        if (viaUnm) return viaUnm
      }
      const hit = normalizeUnblockResult(await matchID(id, name))
      if (hit) return hit
    } catch (error) {
      // 单个音源异常（超时 / 上游返回错误页）不应中断整轮遍历，继续试下一个
      logger.error(`Unblock source ${name} error:`, error.message)
    }
  }

  // 兜底：若解灰包升级后音源模块改名，上面的静态顺序会全部落空，
  // 此时回退到解灰包自身的默认遍历，保证功能不因模块改名而整体失效。
  const fallback = normalizeUnblockResult(await matchID(id))
  return (
    fallback || { code: 500, message: 'No available source found', data: null }
  )
}

module.exports = {
  isFakeUnblockUrl,
  toHttpsUrl,
  unblockMatch,

  toBoolean(val) {
    if (typeof val === 'boolean') return val
    if (val === '') return val
    return val === 'true' || val == '1'
  },

  cookieToJson(cookie) {
    if (!cookie) return {}
    let cookieArr = cookie.split(';')
    let obj = {}

    // 优化：使用for循环替代forEach，性能更好
    for (let i = 0, len = cookieArr.length; i < len; i++) {
      let item = cookieArr[i]
      let separator = item.indexOf('=')
      // 只按第一个等号拆分，保留 Cookie 值中的等号
      if (separator > 0) {
        obj[item.slice(0, separator).trim()] = item.slice(separator + 1).trim()
      }
    }
    return obj
  },

  hasCookie(cookie) {
    if (typeof cookie === 'string') return cookie.length > 0
    return (
      cookie !== null &&
      typeof cookie === 'object' &&
      Object.keys(cookie).length > 0
    )
  },

  getCookieHeader(headers) {
    if (!headers || typeof headers !== 'object') return ''

    if (typeof headers.get === 'function') {
      const cookie = headers.get('cookie')
      if (typeof cookie === 'string') return cookie
    }

    const headerName = Object.keys(headers).find(
      (name) => name.toLowerCase() === 'cookie',
    )
    if (!headerName) return ''

    const cookie = headers[headerName]
    if (Array.isArray(cookie)) return cookie.join('; ')
    return typeof cookie === 'string' ? cookie : ''
  },

  cookieObjToString(cookie) {
    // 优化：使用预绑定的keys函数和for循环
    const cookieKeys = keys(cookie)
    const result = []

    // 优化：使用for循环和预分配数组
    for (let i = 0, len = cookieKeys.length; i < len; i++) {
      const key = cookieKeys[i]
      result[i] = `${encode(key)}=${encode(cookie[key])}`
    }

    return result.join('; ')
  },

  getRandom(num) {
    // 优化：简化随机数生成逻辑
    // 原逻辑看起来有问题，这里保持原意但优化性能
    var randomValue = random()
    var floorValue = floor(randomValue * 9 + 1)
    var powValue = Math.pow(10, num - 1)
    var randomNum = floor((randomValue + floorValue) * powValue)
    return randomNum
  },

  generateRandomChineseIP() {
    // 从预定义的中国 IP 段中按权重随机选择一个段，然后在该段内生成随机 IP
    const total = chinaIPRanges.totalCount || 0
    if (!total) {
      // 兜底：回退到旧逻辑（随机 116.x 前缀）
      const fallback = `116.${getRandomInt(25, 94)}.${generateIPSegment()}.${generateIPSegment()}`
      logger.info('Generated Random Chinese IP (fallback):', fallback)
      return fallback
    }

    // 选择一个全局随机偏移（[0, total)）
    let offset = Math.floor(random() * total)
    let chosen = null
    for (let i = 0; i < chinaIPRanges.length; i++) {
      const seg = chinaIPRanges[i]
      if (offset < seg.count) {
        chosen = seg
        break
      }
      offset -= seg.count
    }

    // 如果没有选中（理论上不应该发生），回退到最后一个段
    if (!chosen) chosen = chinaIPRanges[chinaIPRanges.length - 1]

    // 在段内随机生成一个 IP（使用段真实的数值范围）
    const segSize = chosen.end - chosen.start + 1
    const ipInt = chosen.start + Math.floor(random() * segSize)
    const ip = intToIp(ipInt)
    logger.info('Generated Random Chinese IP:', ip, 'from CIDR:', chosen.cidr)
    return ip
  },
  // 生成chainId的函数
  generateChainId(cookie) {
    const version = 'v1'
    const randomNum = Math.floor(Math.random() * 1e6)
    const deviceId =
      getCookieValue(cookie, 'sDeviceId') || 'unknown-' + randomNum
    const platform = 'web'
    const action = 'login'
    const timestamp = Date.now()

    return `${version}_${deviceId}_${platform}_${action}_${timestamp}`
  },

  generateDeviceId() {
    const hexChars = '0123456789ABCDEF'
    const chars = []
    for (let i = 0; i < 52; i++) {
      const randomIndex = Math.floor(Math.random() * hexChars.length)
      chars.push(hexChars[randomIndex])
    }
    return chars.join('')
  },
}

// 优化：预先绑定函数
function getRandomInt(min, max) {
  // 优化：简化计算
  return floor(random() * (max - min + 1)) + min
}

// 优化：预先绑定generateIPSegment函数引用
function generateIPSegment() {
  // 优化：内联常量
  return getRandomInt(1, 255)
}

// 进一步优化版本（如果需要更高性能）：
/*
const cookieToJsonOptimized = (function() {
  // 预编译trim函数
  const trim = String.prototype.trim
  
  return function(cookie) {
    if (!cookie) return {}
    
    const cookieArr = cookie.split(';')
    const obj = {}
    
    for (let i = 0, len = cookieArr.length; i < len; i++) {
      const item = cookieArr[i]
      const eqIndex = item.indexOf('=')
      
      if (eqIndex > 0 && eqIndex < item.length - 1) {
        const key = trim.call(item.substring(0, eqIndex))
        const value = trim.call(item.substring(eqIndex + 1))
        obj[key] = value
      }
    }
    return obj
  }
})()
*/

// 用于从cookie字符串中获取指定值的辅助函数
function getCookieValue(cookieStr, name) {
  if (!cookieStr) return ''

  if (typeof cookieStr === 'object') return cookieStr[name] || ''

  const cookies = '; ' + cookieStr
  const parts = cookies.split('; ' + name + '=')
  if (parts.length === 2) return parts.pop().split(';').shift()
  return ''
}

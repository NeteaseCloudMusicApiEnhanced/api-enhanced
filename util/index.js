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

    logger.info(
      `Loaded ${arr.length} Chinese IP ranges from china_ip_ranges.txt, total ${total} IPs`,
    )
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

module.exports = {
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
      let arr = item.split('=')
      // 优化：使用严格等于
      if (arr.length === 2) {
        obj[arr[0].trim()] = arr[1].trim()
      }
    }
    return obj
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

  const cookies = '; ' + cookieStr
  const parts = cookies.split('; ' + name + '=')
  if (parts.length === 2) return parts.pop().split(';').shift()
  return ''
}

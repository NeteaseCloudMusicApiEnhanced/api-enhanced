// 歌曲链接 - v1
// 此版本不再采用 br 作为音质区分的标准
// 而是采用 standard, exhigh, lossless, hires, jyeffect(高清臻音), vivid(臻音全景声), jymaster(超清母带), sky(沉浸环绕声) 进行音质判断
// 当unblock为true时, 会尝试使用unblockmusic-utils进行解锁, 同时音质设置不会生效, 但仍然为必须传入参数
// 当level为sky时, 可通过 immerseType 选择沉浸声类型, 支持 c512(新版c51类型)、ste2(新版环绕立体声类型)、aac2(新版aac类型)、c51(c51类型)、ste(环绕立体声类型)、aac(aac类型), 默认为 c51
//
// unblock 失败语义（破坏性变更，文档见 public/docs/home.md）:
// 当 unblock=true 且解灰失败时, 不再静默回落到官方试听(HTTP 200 + freeTrialInfo), 而是返回非 200:
//   - 500: 无可用音源 / 内部错误       (error: NO_AVAILABLE_SOURCE / INTERNAL_ERROR)
//   - 404: 指定的 source 模块不存在     (error: MODULE_NOT_FOUND)
//   - 400: 缺少 id                     (error: MISSING_ID)
// 响应体: { code, msg: 'unblock failed: ...', error: '<MACHINE_CODE>', data: [] }
// 迁移: 需要官方试听请去掉 unblock 参数重新请求; 解灰失败可直接重试, 或改用 /song/url/match.
// 风格对齐 module/song_url_match.js.

const logger = require('../util/logger.js')
const createOption = require('../util/option.js')
const { cookieToJson } = require('../util/index.js')

// 稳定的失败响应。对外只暴露稳定 msg + 机器码 (error)，内部异常信息只写日志，
// 避免把偶发内部错误(如 TypeError)固化成公开契约。
const UNBLOCK_FAILURES = {
  MISSING_ID: { status: 400, code: 400, msg: 'unblock failed: missing id' },
  MODULE_NOT_FOUND: {
    status: 404,
    code: 404,
    msg: 'unblock failed: source module not found',
  },
  NO_AVAILABLE_SOURCE: {
    status: 500,
    code: 500,
    msg: 'unblock failed: no available source',
  },
  INTERNAL_ERROR: {
    status: 500,
    code: 500,
    msg: 'unblock failed: internal error',
  },
}

/**
 * 构造解灰失败响应
 * @param {keyof typeof UNBLOCK_FAILURES} type 失败类型（同时作为机器码返回）
 */
function unblockFailure(type) {
  const { status, code, msg } = UNBLOCK_FAILURES[type]
  return {
    status,
    body: {
      code,
      msg,
      error: type,
      data: [],
    },
    cookie: [],
  }
}

/**
 * matchID() 的失败 code → 失败响应（保留 400/404 语义，其余按 500 处理）
 * @param {number} code matchID 返回的 code
 */
function matchFailure(code) {
  switch (code) {
    case 400:
      return unblockFailure('MISSING_ID')
    case 404:
      return unblockFailure('MODULE_NOT_FOUND')
    default:
      return unblockFailure('NO_AVAILABLE_SOURCE')
  }
}

module.exports = async (query, request) => {
  const {
    matchID,
  } = require('@neteasecloudmusicapienhanced/unblockmusic-utils')
  require('dotenv').config()
  const data = {
    ids: '[' + query.id + ']',
    level: query.level,
    encodeType: 'flac',
  }
  const options = createOption(query, 'xeapi')
  if (query.unblock === 'true') {
    try {
      const result = await matchID(query.id, query.source)
      logger.info('Starting unblock(uses modules unblock):', query.id, result)
      if (!result || !Number.isInteger(result.code)) {
        logger.error('Unblock failed(uses modules unblock): malformed result', {
          id: query.id,
          result,
        })
        return unblockFailure('INTERNAL_ERROR')
      }
      if (result.code !== 200) {
        return matchFailure(result.code)
      }
      // 只接受非空字符串 url：matchID 的成功契约是 data.url 为 URL 字符串。
      if (
        !result.data ||
        typeof result.data.url !== 'string' ||
        result.data.url === ''
      ) {
        logger.error('Unblock failed(uses modules unblock): malformed url', {
          id: query.id,
          result,
        })
        return unblockFailure('INTERNAL_ERROR')
      }
      const useProxy = process.env.ENABLE_PROXY || 'false'
      let proxyUrl = ''
      if (result.data.url.includes('kuwo')) {
        proxyUrl =
          useProxy === 'true' && process.env.PROXY_URL
            ? process.env.PROXY_URL + result.data.url
            : result.data.url
      }
      return {
        status: 200,
        body: {
          code: 200,
          msg: 'Warning: Customizing unblock sources is not supported on this endpoint. Please use `/song/url/match` instead.',
          data: [
            {
              id: Number(query.id),
              url: result.data.url,
              type: 'flac',
              level: query.level,
              freeTrialInfo: 'null',
              fee: 0,
              proxyUrl: proxyUrl || '',
            },
          ],
        },
        cookie: [],
      }
    } catch (e) {
      // 意外异常：只记日志（含 stack），对外返回稳定机器码，不泄露内部错误文本。
      logger.error(
        'Unblock failed(uses modules unblock):',
        query.id,
        (e && e.message) || 'unknown error',
        (e && e.stack) || '',
      )
      return unblockFailure('INTERNAL_ERROR')
    }
  }
  if (data.level == 'sky') {
    data.immerseType = query.immerseType || 'c51'
  }
  if (data.level == 'vivid') {
    data.encodeType = 'mp3'
    const cookie = options.cookie
    options.cookie = {
      ...(typeof cookie === 'string' ? cookieToJson(cookie) : cookie),
      os: 'android',
      appver: '9.5.61',
    }
  }
  return request(`/api/song/enhance/player/url/v1`, data, options)
}

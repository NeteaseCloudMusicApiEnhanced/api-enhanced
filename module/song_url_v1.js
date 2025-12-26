// 歌曲链接 - v1
// 此版本不再采用 br 作为音质区分的标准
// 而是采用 standard, exhigh, lossless, hires, jyeffect(高清环绕声), sky(沉浸环绕声), jymaster(超清母带) 进行音质判断
// 当unblock为true时, 会尝试使用unblockmusic-utils进行解锁, 同时音质设置不会生效, 但仍然为必须传入参数

const logger = require('../util/logger.js')
const createOption = require('../util/option.js')
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
  if (query.unblock === 'true') {
    try {
      const result = await matchID(query.id, query.source)
      logger.info('Starting unblock(uses modules unblock):', query.id, result)
      const useProxy = process.env.ENABLE_PROXY || 'false'
      let proxyUrl = ''
      if (result.data.url && result.data.url.includes('kuwo')) {
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
      console.error('Error in unblocking music:', e)
    }
  }
  if (data.level == 'sky') {
    data.immerseType = 'c51'
  }
  return request(`/api/song/enhance/player/url/v1`, data, createOption(query))
}

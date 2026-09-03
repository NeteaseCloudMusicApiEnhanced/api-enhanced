// 网易云歌曲解灰(适配SPlayer的UNM-Server)
// 支持qq音乐、酷狗音乐、酷我音乐、咪咕音乐、第三方网易云API等等(来自GD音乐台)

const logger = require('../util/logger.js')

module.exports = async (query, request) => {
  try {
    const {
      matchID,
    } = require('@neteasecloudmusicapienhanced/unblockmusic-utils')
    const proxy = process.env.PROXY_URL
    const useProxy = process.env.ENABLE_PROXY || 'false'

    let url = null

    const result = await matchID(query.id, query.source)
    logger.info('开始解灰', query.id, result)

    if (result.data && result.data.url) {
      url = result.data.url
    } else {
      logger.warn('matchID failed, trying UNM direct:', result.message || 'No source found')
      const unmMatch = require('@unblockneteasemusic/server')
      const unmSources = ['kugou', 'bodian', 'migu', 'qq', 'kuwo', 'joox', 'pyncmd', 'bilivideo']
      const response = await unmMatch(query.id, unmSources)
      if (response && response.url) {
        url = response.url
        logger.info('UNM direct success! url:', url)
      } else {
        logger.warn('UNM direct also failed, no source found')
      }
    }

    if (!url) {
      return {
        status: 500,
        body: {
          code: 500,
          msg: 'No available source found',
          data: [],
        },
      }
    }

    let proxyUrl = ''
    if (url.includes('kuwo')) {
      proxyUrl = useProxy === 'true' && proxy ? proxy + url : url
    }

    return {
      status: 200,
      body: {
        code: 200,
        data: url,
        proxyUrl: proxyUrl || '',
      },
    }
  } catch (e) {
    logger.error('解灰异常:', e.message)
    return {
      status: 500,
      body: {
        code: 500,
        msg: e.message || 'unblock error',
        data: [],
      },
    }
  }
}

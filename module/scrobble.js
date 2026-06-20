// 听歌打卡

const createOption = require('../util/option.js')
const { APP_CONF } = require('../util/config.json')
const DOMAIN = APP_CONF.clDomian
module.exports = async (query, request) => {
  // 注入 os=osx 的 cookie
  let cookie = query.cookie || ''
  if (typeof cookie === 'object') {
    cookie = Object.assign({ os: 'osx' }, cookie)
  } else if (typeof cookie === 'string') {
    if (cookie.indexOf('os=') > -1) {
      cookie = cookie.replace(/os=[^;]+/g, 'os=osx')
    } else {
      cookie = cookie + '; os=osx'
    }
  } else {
    cookie = 'os=osx'
  }
  query.cookie = cookie

  // 1) startplay → 进「最近播放」
  const startplayData = {
    logs: JSON.stringify([
      {
        action: 'startplay',
        json: {
          id: query.id,
          type: 'song',
          mainsite: '1',
          mainsiteWeb: '1',
          content: `id=${query.sourceid}`,
        },
      },
    ]),
  }

  // 2) play → 涨「听歌排行」计数
  const playData = {
    logs: JSON.stringify([
      {
        action: 'play',
        json: {
          download: 0,
          end: 'playend',
          id: query.id,
          sourceId: query.sourceid,
          time: query.time,
          type: 'song',
          wifi: 0,
          source: 'list',
          mainsite: '1',
          mainsiteWeb: '1',
          content: `id=${query.sourceid}`,
        },
      },
    ]),
  }

  const option = createOption(query, 'eapi')
  option.domain = DOMAIN

  // 发送两次请求
  const res1 = await request(`/api/feedback/weblog`, startplayData, option)
  const res2 = await request(`/api/feedback/weblog`, playData, option)

  return {
    status: 200,
    body: {
      code: 200,
      data: 'success',
      details: {
        startplay: res1.body,
        play: res2.body,
      },
    },
  }
}

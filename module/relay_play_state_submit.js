// 提交歌曲播放状态

const createOption = require('../util/option.js')
const generateSessionId = () =>
  Array.from(
    { length: 12 },
    () =>
      'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[Math.floor(Math.random() * 36)],
  ).join('')

module.exports = (query, request) => {
  const {
    id,
    sessionId,
    progress = 0,
    playMode = 'list_loop',
    type = 'song',
  } = query

  if (!id) {
    return Promise.reject({
      status: 400,
      body: {
        code: 400,
        msg: '缺少必要参数：id',
      },
    })
  }

  const playStateSubmitReq = JSON.stringify({
    resource: {
      id: String(id),
      type: type,
    },
    progress: Number(progress) || 0,
    sessionId: sessionId || generateSessionId(),
    playMode: playMode,
  })

  const data = {
    playStateSubmitReq: playStateSubmitReq,
  }

  return request(
    '/api/relay/play/state/submit',
    data,
    createOption(query, 'weapi'),
  )
}

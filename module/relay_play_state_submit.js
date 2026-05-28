// 提交歌曲播放状态

const createOption = require('../util/option.js')
module.exports = (query, request) => {
  const { id, sessionId, progress = 0, playMode = 'list_loop', type = 'song' } = query

  if (!id || !sessionId) {
    return Promise.reject({
      status: 400,
      body: {
        code: 400,
        msg: '缺少必要参数：id, sessionId',
      },
    })
  }

  const playStateSubmitReq = JSON.stringify({
    resource: {
      id: String(id),
      type: type
    },
    progress: progress,
    sessionId: sessionId,
    playMode: playMode
  })

  const data = {
    playStateSubmitReq: playStateSubmitReq
  }

  return request('/api/relay/play/state/submit', data, createOption(query, 'weapi'))
}

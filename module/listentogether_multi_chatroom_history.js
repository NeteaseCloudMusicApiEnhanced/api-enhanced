// 一起听 多人-聊天室原始消息
// 与 match/msg/history 不同，这个接口直接查询云信聊天室消息。
const createOption = require('../util/option.js')

module.exports = (query, request) => {
  const roomId = String(query.roomId || '')
  if (!/^[1-9]\d{0,23}$/.test(roomId))
    throw new Error('roomId 必须传 chatRoomId（纯数字）')

  const limit = Math.min(Math.max(Number(query.limit) || 30, 1), 100)
  const data = {
    roomId,
    timeStamp: Number(query.timeStamp) || Date.now(),
    limit,
    reverse: query.reverse !== 'false',
    queryMsgTypeList: query.queryMsgTypeList || '["text"]',
    uniqueBizId: query.uniqueBizId || '',
    scene: 'listenTogether',
  }

  return request(
    `/api/middle/im/chatroom/msg/history/query`,
    data,
    createOption(query, 'eapi'),
  )
}

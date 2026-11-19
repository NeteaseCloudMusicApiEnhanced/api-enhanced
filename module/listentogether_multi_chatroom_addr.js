// 一起听 多人-聊天室地址
// 用于独立模式/匿名聊天室；普通 IM 模式优先用 chatroom/token。
const createOption = require('../util/option.js')

module.exports = (query, request) => {
  const roomId = String(query.roomId || '')
  if (!/^[1-9]\d{0,23}$/.test(roomId))
    throw new Error('roomId 必须传 chatRoomId（纯数字）')

  const data = {
    bizTag: query.bizTag || 'music_listenTogether',
    roomId,
    appType: String(query.appType || '6'),
  }

  return request(
    `/api/middle/im/chatroom/addr/request`,
    data,
    createOption(query, 'eapi'),
  )
}

// 一起听 多人-聊天室 IM 登录凭据
// roomId 必须是 multiRoomInfoDTO.chatRoomId，不是一起听房间 ID。
const createOption = require('../util/option.js')

module.exports = (query, request) => {
  const roomId = String(query.roomId || '')
  if (!/^[1-9]\d{0,23}$/.test(roomId))
    throw new Error('roomId 必须传 chatRoomId（纯数字）')

  const data = {
    bizName: query.bizName || 'music_listenTogether',
    roomId,
    appType: String(query.appType || '6'),
  }

  return request(
    `/api/middle/im/token-and-chatroom-addr/get`,
    data,
    createOption(query, 'eapi'),
  )
}

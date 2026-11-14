// 一起听 多人-发送消息
const createOption = require('../util/option.js')

module.exports = (query, request) => {
  const data = {
    chatroomId: query.chatRoomId,
    msgType: 0,
    clientExt: JSON.stringify({
      bizType: 'listenTogether',
      ltType: 'MULTI_MATCH_SONG',
      roomId: query.roomId,
      ...(query.emoji ? { emoji: query.emoji } : {}),
    }),
    msgBody: JSON.stringify({
      msg: query.text,
      msgType: 0,
    }),
  }
  
  return request(
    `/api/middle/im/chatroom/send`,
    data,
    createOption(query, 'eapi'),
  )
}
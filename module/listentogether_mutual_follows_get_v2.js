// 一起听 多人-邀请面板：互关/推荐用户、群聊、AI 机器人、直播间推荐
const createOption = require('../util/option.js')
module.exports = (query, request) => {
  const data = {
    roomId: query.roomId || '',
    songId: query.songId || '',
  }
  return request(
    `/api/listen/together/mutual/follows/get/v2`,
    data,
    createOption(query, 'eapi'),
  )
}

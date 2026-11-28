// 一起听 多人-分享落地页信息（邀请预览）
// 返回邀请人、房间其他成员、房间状态和当前歌曲，用于打开分享链接前的预览。
const createOption = require('../util/option.js')

module.exports = (query, request) => {
  const data = {
    roomId: query.roomId,
    inviterUid: query.inviterUid || 0,
  }
  return request(
    `/api/listen/together/multi/landing/info/get`,
    data,
    createOption(query, 'eapi'),
  )
}

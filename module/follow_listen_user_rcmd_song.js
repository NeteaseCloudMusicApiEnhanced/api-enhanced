// 目前不知道有什么用，反正逆向出来了...
const createOption = require('../util/option.js')
module.exports = (query, request) => {
  const data = {
    roomId: query.roomId,
    songId: query.songId,
  }
  return request(
    `/api/follow/listen/user/rcmd/song`,
    data,
    createOption(query, 'eapi', 'v3_body'),
  )
}

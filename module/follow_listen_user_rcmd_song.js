// 一起听 多人-关注推荐歌曲
const createOption = require('../util/option.js')
module.exports = (query, request) => {
  const data = {
    roomId: query.roomId,
    songId: query.songId,
  }
  return request(
    `/api/follow/listen/user/rcmd/song`,
    data,
    createOption(query, 'eapi', 'v2_body'),
  )
}

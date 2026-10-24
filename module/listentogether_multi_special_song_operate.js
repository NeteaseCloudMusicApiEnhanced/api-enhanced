// 一起听 多人-特殊权限歌曲操作
const createOption = require('../util/option.js')
module.exports = (query, request) => {
  const data = {
    roomId: query.roomId,
    songId: query.songId || 0,
    bizId: query.bizId || 0,
    operate: query.operate || 0,
  }
  return request(
    `/api/listen/together/multi/special/song/operate`,
    data,
    createOption(query, 'eapi', 'v2_body'),
  )
}

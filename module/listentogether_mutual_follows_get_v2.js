// 一起听 多人-获取互关/推荐
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

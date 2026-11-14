// 一起听 多人-获取完整待播列表
const createOption = require('../util/option.js')
module.exports = (query, request) => {
  const data = {
    roomId: query.roomId,
    page: query.page || '{"size":20}',
  }
  return request(
    `/api/listen/together/multi/match/wait/song/list`,
    data,
    createOption(query, 'eapi'),
  )
}
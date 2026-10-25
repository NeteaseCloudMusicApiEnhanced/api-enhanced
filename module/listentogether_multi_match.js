// 一起听 多人-发起匹配
const createOption = require('../util/option.js')
module.exports = (query, request) => {
  const data = {
    songId: query.songId,
  }
  return request(
    `/api/listen/together/multi/match`,
    data,
    createOption(query, 'eapi', 'v2_body'),
  )
}

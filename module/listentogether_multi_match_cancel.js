// 一起听 多人匹配-取消匹配
const createOption = require('../util/option.js')
module.exports = (query, request) => {
  const data = {}
  return request(
    `/api/listen/together/multi/match/cancel`,
    data,
    createOption(query, 'eapi'),
  )
}

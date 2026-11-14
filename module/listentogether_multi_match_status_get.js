// 一起听 多人-获取匹配状态
const createOption = require('../util/option.js')
module.exports = (query, request) => {
  const data = {}
  return request(
    `/api/listen/together/multi/match/status/get`,
    data,
    createOption(query, 'eapi'),
  )
}

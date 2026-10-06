// 一起听 多人-心跳
const createOption = require('../util/option.js')
module.exports = (query, request) => {
  const data = {
    roomId: query.roomId,
  }
  return request(
    `/api/listen/together/multi/match/heartbeat`,
    data,
    createOption(query, 'eapi', 'v2_body'),
  )
}

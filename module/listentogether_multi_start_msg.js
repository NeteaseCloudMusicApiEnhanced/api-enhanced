// 一起听 多人-开始消息
const createOption = require('../util/option.js')
module.exports = (query, request) => {
  const data = {
    roomId: query.roomId,
  }
  return request(
    `/api/listen/together/multi/start/msg`,
    data,
    createOption(query, 'eapi'),
  )
}

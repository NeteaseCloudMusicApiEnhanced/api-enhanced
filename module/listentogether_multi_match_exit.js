// 一起听 多人-退出房间
const createOption = require('../util/option.js')
module.exports = (query, request) => {
  const data = {
    roomId: query.roomId,
    exitType: query.exitType || 'NORMAL_END',
  }
  return request(
    `/api/listen/together/multi/match/exit`,
    data,
    createOption(query, 'eapi', 'v2_body'),
  )
}

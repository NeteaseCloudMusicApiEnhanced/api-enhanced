// 一起听 多人-接受邀请
// 注意：checkToken 必须放 body，服务端强制校验
const createOption = require('../util/option.js')
module.exports = (query, request) => {
  const data = {
    roomId: query.roomId,
    agree: query.agree !== undefined ? query.agree : true,
    inviterUid: query.inviterUid ? Number(query.inviterUid) : 0,
  }
  return request(
    `/api/listen/together/multi/match/ack`,
    data,
    createOption(query, 'eapi', 'v2_body'),
  )
}

// 一起听 多人-接受邀请
// 注意：checkToken 必须放 body，服务端强制校验
import { toBoolean } from '../util/index.js'
const createOption = require('../util/option.js')
module.exports = (query, request) => {
  const agree = query.agree !== undefined ? toBoolean(query.agree) : true // 默认同意
  const data = {
    roomId: query.roomId,
    agree: agree,
    inviterUid: query.inviterUid ? Number(query.inviterUid) : 0,
  }
  return request(
    `/api/listen/together/multi/match/ack`,
    data,
    createOption(query, 'eapi', 'v2_body'),
  )
}

// 一起听 多人-邀请
const createOption = require('../util/option.js')
const { toIdArray } = require('../util/index.js')
module.exports = (query, request) => {
  const data = {
    roomId: query.roomId,
    groupIds: toIdArray(query.groupIds),
    inviteUids: toIdArray(query.invitedUids || query.inviteUids),
  }
  return request(
    `/api/listen/together/multi/invite`,
    data,
    createOption(query, 'eapi'),
  )
}

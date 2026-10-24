// 一起听 多人-创建房间
const createOption = require('../util/option.js')
const { toIdArray, toBoolean } = require('../util/index.js')
module.exports = (query, request) => {
  const newCreate =
    query.newCreate !== undefined ? toBoolean(query.newCreate) : true // 默认新建

  const data = {
    type: query.type || 0,
    songId: query.songId || 0,
    groupIds: toIdArray(query.groupIds),
    inviteUids: toIdArray(query.invitedUids || query.inviteUids),
    from: newCreate ? 'CREATE' : 'LISTEN_TOGETHER',
    playedTime: query.playedTime || 0,
    nextSongIds: toIdArray(query.nextSongIds),
    checkToken: query.checkToken || '',
  }

  // autoJoinUids 语义是"空数组就不传"，保持与apk原版一致
  if (query.autoJoinUids && query.autoJoinUids.length) {
    data.autoJoinUids = toIdArray(query.autoJoinUids)
  }

  if (query.artistId) data.artistId = query.artistId

  // playlistIds 原版是数组字符串，统一归一化
  if (query.playlistIds) {
    data.playlistIds = toIdArray(query.playlistIds)
  }

  return request(
    `/api/listen/together/multi/room/create`,
    data,
    createOption(query, 'eapi', 'v2_body'),
  )
}

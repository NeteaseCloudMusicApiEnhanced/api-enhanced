// 一起听 多人-创建房间
const createOption = require('../util/option.js')
module.exports = (query, request) => {
  const toIdArray = (v) =>
    Array.isArray(v) ? '[' + v.join(',') + ']' : v || '[]'

  const data = {
    type: query.type || 0,
    songId: query.songId || 0,
    groupIds: toIdArray(query.groupIds),
    inviteUids: toIdArray(query.invitedUids || query.inviteUids),
    from: query.newCreate === false ? 'LISTEN_TOGETHER' : 'CREATE',
    playedTime: query.playedTime || 0,
    nextSongIds: query.nextSongIds || '',
  }
  if (query.autoJoinUids && query.autoJoinUids.length) {
    data.autoJoinUids = toIdArray(query.autoJoinUids)
  }
  if (query.artistId) data.artistId = query.artistId
  if (query.playlistIds) data.playlistIds = query.playlistIds

  return request(
    `/api/listen/together/multi/room/create`,
    data,
    createOption(query, 'eapi', 'v2_body'),
  )
}

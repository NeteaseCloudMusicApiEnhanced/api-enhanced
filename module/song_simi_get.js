// 插播相似歌曲

const createOption = require('../util/option.js')
module.exports = (query, request) => {
  const data = {
    positionCode: 'toolBarRcmdSong',
    resourceId: query.id,
    resourceType: 'song',
  }
  return request(
    `/api/link/position/show/resource`,
    data,
    createOption(query, 'eapi'),
  )
}

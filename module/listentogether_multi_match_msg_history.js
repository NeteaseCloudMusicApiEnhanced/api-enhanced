// 一起听 多人-匹配房间聊天历史
const createOption = require('../util/option.js')
module.exports = (query, request) => {
  const page = {}
  if (query.size !== undefined && query.size !== null) page.size = query.size
  if (query.cursor !== undefined && query.cursor !== null)
    page.cursor = query.cursor

  const data = {
    roomId: query.roomId,
    direction: query.direction || 0,
    page: JSON.stringify(page),
  }
  return request(
    `/api/listen/together/multi/match/msg/history`,
    data,
    createOption(query, 'eapi'),
  )
}

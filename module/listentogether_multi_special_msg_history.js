// 一起听 多人-特殊房间聊天历史
const createOption = require('../util/option.js')
module.exports = (query, request) => {
  const page = {
    size: Number(query.size) || 20,
  }
  if (
    query.cursor !== undefined &&
    query.cursor !== null &&
    query.cursor !== ''
  ) {
    page.cursor = String(query.cursor)
  }

  const data = {
    roomId: query.roomId,
    direction: Number(query.direction) || 0,
    page: JSON.stringify(page),
  }
  return request(
    `/api/listen/together/multi/special/msg/history`,
    data,
    createOption(query, 'eapi'),
  )
}

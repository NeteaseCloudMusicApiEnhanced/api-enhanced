// 一起听 多人-已播放歌曲列表
// 与 wait/song/list 不同：这里返回已经播放/被替换的历史歌曲。
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
    sort: Number(query.sort) || 1,
    page: query.page || JSON.stringify(page),
  }
  return request(
    `/api/listen/together/multi/match/played/song/list`,
    data,
    createOption(query, 'eapi'),
  )
}

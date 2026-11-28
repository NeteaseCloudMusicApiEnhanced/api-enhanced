// 一起听 多人-已播放歌曲详情
// 用 songBizId 查询单首歌在房间里的播放/点赞/推荐人状态。
const createOption = require('../util/option.js')

module.exports = (query, request) => {
  const data = {
    roomId: query.roomId,
    songBizId: query.songBizId || query.bizId,
  }
  return request(
    `/api/listen/together/multi/played/song/info`,
    data,
    createOption(query, 'eapi'),
  )
}

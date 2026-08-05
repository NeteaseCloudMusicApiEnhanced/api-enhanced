// 云贝广告任务 - 获取推荐歌曲
// 逆向来源: 云贝任务中心 H5 (st.music.163.com/yunbei-listen) main.js
// POST /api/ad/power/yunbei/distribution/recommend/song
// 参数: offset (默认 0), limit (默认 10, 客户端一次 10 首)
// 返回: 推荐歌曲数组 [{ songId, songName, artistName, albumUrl, songChorusStartTime, likeFlag, alg }]
// 注意: alg 均为 alg_payrec_yunBei_*, 为"听歌得云贝"任务专属推荐

const createOption = require('../util/option.js')

module.exports = (query, request) => {
  const data = {
    offset: query.offset || 0,
    limit: query.limit || 10,
  }
  return request(
    `/api/ad/power/yunbei/distribution/recommend/song`,
    data,
    createOption(query, 'weapi'),
  )
}

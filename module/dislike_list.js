// 获取「不感兴趣」歌曲列表
// 登录后调用，返回用户标记为不感兴趣的歌曲、歌手与播客 id 列表
// 抓包来源：PC 客户端 3.1.43（xeapi），响应形如
// { code: 200, data: { songIdList: [], artistIdList: [], podcastIds: [], checkPoint } }

const createOption = require('../util/option.js')
module.exports = (query, request) => {
  const data = {}
  return request(`/api/music/dislike/get`, data, createOption(query, 'xeapi'))
}

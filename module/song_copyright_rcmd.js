// 灰色歌曲的其他版本推荐

const createOption = require('../util/option.js')
module.exports = (query, request) => {
  const data = {
    songid: query.songid || query.id,
  }
  return request(`/api/song/copyright/rcmd`, data, createOption(query, 'eapi'))
}

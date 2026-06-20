// 歌曲创作者信息

const createOption = require('../util/option.js')
module.exports = (query, request) => {
  const data = {
    songId: query.id,
  }
  return request(`/api/song/creators`, data, createOption(query))
}

// 每日推荐歌曲 - v1

const createOption = require('../util/option.js')
module.exports = (query, request) => {
  const data = {
    ispush: query.ispush || false,
  }
  return request(
    `/api/v3/discovery/recommend/songs`,
    data,
    createOption(query, 'xeapi'),
  )
}

// 每日推荐风格歌曲

const createOption = require('../util/option.js')
module.exports = (query, request) => {
  const data = {}
  return request(
    `/api/homepage/category/daily/song/list`,
    data,
    createOption(query, 'xeapi'),
  )
}

// 按歌词搜索

const createOption = require('../util/option.js')
module.exports = (query, request) => {
  const data = {
    keyword: query.keyword || query.keywords || '',
    limit: query.limit || 30,
    offset: query.offset || 0,
  }
  return request(
    `/api/search/resource/lyric`,
    data,
    createOption(query, 'weapi'),
  )
}

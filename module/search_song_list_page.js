// 新版单曲搜索（分页）

const createOption = require('../util/option.js')
module.exports = (query, request) => {
  const data = {
    keyword: query.keyword || query.keywords || '',
    limit: query.limit || 30,
    offset: query.offset || 0,
    scene: query.scene || 'normal',
  }
  return request(
    `/api/search/song/list/page`,
    data,
    createOption(query, 'weapi'),
  )
}

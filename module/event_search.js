// 动态搜索

const createOption = require('../util/option.js')
module.exports = (query, request) => {
  const data = {
    keyword: query.keyword || query.keywords || '',
    limit: query.limit || 30,
    offset: query.offset || 0,
  }
  return request(
    `/api/event/search/list/get/v1`,
    data,
    createOption(query, 'weapi'),
  )
}

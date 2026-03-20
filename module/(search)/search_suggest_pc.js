// 搜索建议pc端

const createOption = require('../../util/option.js')
module.exports = (query, request) => {
  const data = {
    keyword: query.keyword || '',
  }
  return request(
    `/api/search/pc/suggest/keyword/get`,
    data,
    createOption(query),
  )
}

// 热评墙广场信息

const createOption = require('../util/option.js')
module.exports = (query, request) => {
  const data = {}
  return request(
    `/api/comment/hotwall/today/squareinfo/get`,
    data,
    createOption(query, 'weapi'),
  )
}

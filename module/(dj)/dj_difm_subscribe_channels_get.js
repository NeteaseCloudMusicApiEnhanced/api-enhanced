// DIFM电台 - 收藏列表

const createOption = require('../../util/option.js')
module.exports = (query, request) => {
  const data = {
    sources: query.sources || '[0]',
  }
  return request(
    `/api/dj/difm/subscribe/channels/get/v2`,
    data,
    createOption(query),
  )
}

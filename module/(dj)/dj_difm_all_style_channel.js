// DIFM电台 - 分类

const createOption = require('../../util/option.js')
module.exports = (query, request) => {
  const data = {
    sources: query.sources || '[0]',
  }
  return request(`/api/dj/difm/all/style/channel/v2`, data, createOption(query))
}

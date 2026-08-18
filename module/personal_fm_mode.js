// 私人FM - 模式选择

const createOption = require('../util/option.js')
module.exports = (query, request) => {
  const data = {
    mode: query.mode,
    subMode: query.submode,
    limit: query.limit || 3,
  }
  return request(`/api/v1/radio/get`, data, createOption(query))
}

// 助眠解压 - 标签列表

const createOption = require('../util/option.js')
module.exports = (query, request) => {
  const data = {}
  return request(`/api/voice/sati/tag/list`, data, createOption(query))
}

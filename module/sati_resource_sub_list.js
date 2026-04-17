// 助眠解压 - 收藏列表

const createOption = require('../util/option.js')
module.exports = (query, request) => {
  const data = {}
  return request(`/api/voice/sati/resource/sub/list`, data, createOption(query))
}

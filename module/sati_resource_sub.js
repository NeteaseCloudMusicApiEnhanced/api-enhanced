// 助眠解压 - 收藏

const createOption = require('../util/option.js')
module.exports = (query, request) => {
  const data = {
    id: query.id,
    cancel: query.cancel || false,
  }
  return request(`/api/voice/sati/resource/sub`, data, createOption(query))
}

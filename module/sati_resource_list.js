// 助眠解压 - 获取标签下资源列表

const createOption = require('../util/option.js')
module.exports = (query, request) => {
  const data = {
    tag: query.tag,
    firstQuery: false,
  }

  return request(`/api/voice/sati/resource/list`, data, createOption(query))
}

// 助眠解压 - 特定时间场景下的推荐资源

const createOption = require('../util/option.js')
module.exports = (query, request) => {
  const data = {
    firstQuery: false,
  }
  return request(
    `/api/voice/sati/timescene/resources/get`,
    data,
    createOption(query),
  )
}

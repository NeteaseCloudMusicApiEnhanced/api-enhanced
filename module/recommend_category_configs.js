// 每日风格推荐场景配置列表获取

const createOption = require('../util/option.js')
module.exports = (query, request) => {
  const data = {}
  return request(
    `/api/homepage/daily/song/config/get`,
    data,
    createOption(query, 'xeapi'),
  )
}

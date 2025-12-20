// 黑胶乐签打卡

const createOption = require('../util/option.js')
module.exports = (query, request) => {
  const data = {}
  return request(
    `/api/vip-center-bff/task/sign`,
    data,
    createOption(query, 'weapi'),
  )
}

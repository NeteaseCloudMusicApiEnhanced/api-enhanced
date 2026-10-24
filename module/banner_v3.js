// 首页轮播（v3）

const createOption = require('../util/option.js')
module.exports = (query, request) => {
  const data = {
    clientType: query.clientType || 'android',
  }
  return request(`/api/banner/get/v3`, data, createOption(query, 'weapi'))
}

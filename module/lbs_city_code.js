// 多级行政区划数据获取接口

const createOption = require('../util/option.js')
module.exports = (query, request) => {
  const data = {
    bizCode: query.bizCode || '',
  }
  return request(`/api/lbs/city/code`, data, createOption(query))
}

// 播客分类列表（新版）
// 与旧接口 /djradio/category/get 的区别：返回一级分类及其下全部子分类（含「全部」占位项），
// 用于新版客户端「播客」页的分类导航。无需登录。
// 抓包来源：PC 客户端 3.1.43（xeapi），响应形如
// { code: 200, data: { parentCategoryVoList: [{ id, name, desc, coverUrl, subCategoryVO: [{ id, name }] }] } }

const createOption = require('../util/option.js')
module.exports = (query, request) => {
  return request(
    `/api/dj/radio/category/list`,
    {},
    createOption(query, 'xeapi'),
  )
}

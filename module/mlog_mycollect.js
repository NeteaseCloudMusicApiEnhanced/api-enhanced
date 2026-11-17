// 我收藏的播客（Mlog）——按时间倒序分页
// 登录后调用，返回用户收藏的播客动态列表
// 抓包来源：PC 客户端 3.1.43（xeapi），响应形如
// { code: 200, data: { feeds: [], more: false, time: 0, totalCount } }
// time 传 -1 表示从最新一条开始，下一页用响应里的 time 作为游标

const createOption = require('../util/option.js')
module.exports = (query, request) => {
  const data = {
    time: query.time || '-1',
    limit: query.limit || 30,
    mlogType: query.type || 3,
  }
  return request(
    `/api/mlog/mycollect/bytime/get`,
    data,
    createOption(query, 'xeapi'),
  )
}

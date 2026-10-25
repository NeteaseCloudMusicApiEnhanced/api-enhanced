// 搜索联想（App 移动端版：直hit歌曲卡 + 联想词 + 热搜/原唱标签）
// 注意：参数名为 keyword（传 s 会返回 HTTP 400 空体），
// 与 search_suggest 的旧版 /api/search/suggest/keyword 不同。

const createOption = require('../util/option.js')
module.exports = (query, request) => {
  const data = {
    keyword: query.keyword || query.keywords || '',
  }
  return request(
    `/api/search/suggest/keyword/get`,
    data,
    createOption(query, 'weapi'),
  )
}

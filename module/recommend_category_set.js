// 每日风格推荐场景配置设置

const createOption = require('../util/option.js')
module.exports = (query, request) => {
  const data = {
    tags: JSON.stringify({
      tagIds: String(query.tags).split(',').map(Number),
      categoryId: Number(query.category),
    }),
  }
  console.log(data)
  return request(
    `/api/homepage/daily/song/tag/save`,
    data,
    createOption(query, 'xeapi'),
  )
}

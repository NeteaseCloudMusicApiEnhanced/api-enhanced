// 社交-删除收藏表情
// 从当前账号的网易云自定义表情中移除表情；emojiIds 支持逗号分隔或 JSON 数组字符串。
const createOption = require('../util/option.js')
const { toIdArray } = require('../util/index.js')

module.exports = (query, request) => {
  const emojiIds = toIdArray(query.emojiIds)
  return request(
    '/api/social/emoji/cancel',
    { emojiIds },
    createOption(query, 'eapi'),
  )
}

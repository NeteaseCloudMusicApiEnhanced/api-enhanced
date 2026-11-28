// 社交-收藏表情
// 把聊天里收到的表情加入当前账号的网易云自定义表情。
const createOption = require('../util/option.js')

module.exports = (query, request) => {
  const emojiId = String(query.emojiId || '')
  const emojiGroupId = String(query.emojiGroupId || '')
  if (!/^\d{1,24}$/.test(emojiId)) throw new Error('emojiId 必须是数字')
  if (!/^-?\d{1,24}$/.test(emojiGroupId))
    throw new Error('emojiGroupId 必须是数字')

  return request(
    `/api/social/emoji/collect`,
    { emojiId, emojiGroupId },
    createOption(query, 'eapi'),
  )
}

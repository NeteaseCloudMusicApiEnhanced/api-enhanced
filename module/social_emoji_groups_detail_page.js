// 社交-表情分组详情（分页）
const createOption = require('../util/option.js')

module.exports = (query, request) => {
  const emojiGroupId = String(query.emojiGroupId || '')
  if (!/^-?\d{1,24}$/.test(emojiGroupId))
    throw new Error('emojiGroupId 必须是数字')
  const data = {
    emojiGroupId,
    cursor: query.cursor ? String(query.cursor) : '',
    size: Math.min(Math.max(Number(query.size) || 20, 1), 50),
  }
  return request(
    `/api/social/emoji/groups/detail/page`,
    data,
    createOption(query, 'eapi'),
  )
}

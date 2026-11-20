// 社交-表情分组
// resourceType: 3=一起听房间, 2=私信
const createOption = require('../util/option.js')

module.exports = (query, request) => {
  const resourceType = Number(query.resourceType) || 3
  return request(
    `/api/social/emoji/groups`,
    { resourceType },
    createOption(query, 'eapi'),
  )
}

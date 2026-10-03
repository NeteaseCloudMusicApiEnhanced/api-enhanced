// 用户所处乐迷团详情

const createOption = require('../../util/option.js')

module.exports = (query, request) => {
  const data = {
    groupId: query.groupId || query.id || '',
  }
  return request(
    '/api/social/fansgroup/bff/user/group/detail/get',
    data,
    createOption(query, 'eapi'),
  )
}

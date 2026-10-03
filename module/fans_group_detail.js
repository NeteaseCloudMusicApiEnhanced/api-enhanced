// 乐迷团详情

const createOption = require('../util/option.js')

module.exports = (query, request) => {
  const data = {
    groupId: query.groupId || query.id || '',
    scene: query.scene || '',
  }
  return request(
    '/api/social/fansgroup/bff/detail/get',
    data,
    createOption(query, 'eapi'),
  )
}

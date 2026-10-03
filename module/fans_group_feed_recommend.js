// 乐迷团推荐笔记

const createOption = require('../../util/option.js')

module.exports = (query, request) => {
  const data = {
    artistSelf: query.artistSelf || '0',
    fansGroupId: query.fansGroupId || query.groupId || '',
    cursor: query.cursor || '0',
    size: String(query.size || 10),
  }
  return request(
    '/api/fans/group/feed/recommend/get',
    data,
    createOption(query, 'eapi'),
  )
}

// 获取用户的收藏歌单列表

const createOption = require('../util/option.js')
module.exports = (query, request) => {
  const data = {
    limit: query.limit || '100',
    offset: query.offset || '0',
    userId: query.uid,
    isWebview: 'true',
    includeRedHeart: 'true',
    includeTop: 'true',
  }
  return request(`/api/user/playlist/collect`, data, createOption(query))
}

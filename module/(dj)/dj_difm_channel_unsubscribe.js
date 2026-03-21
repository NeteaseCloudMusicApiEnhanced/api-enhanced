// DIFM电台 - 取消收藏频道

const createOption = require('../../util/option.js')
module.exports = (query, request) => {
  const data = {
    id: query.id,
  }
  return request(`/api/dj/difm/channel/unsubscribe`, data, createOption(query))
}

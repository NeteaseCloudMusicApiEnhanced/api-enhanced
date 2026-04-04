// DIFM电台 - 收藏频道

const createOption = require('../util/option.js')
module.exports = (query, request) => {
  const data = {
    id: query.id,
  }
  return request(`/api/dj/difm/channel/subscribe`, data, createOption(query))
}

// DIFM电台 - 播放列表

const createOption = require('../util/option.js')
module.exports = (query, request) => {
  const data = {
    limit: query.limit || 5,
    source: query.source || 0,
    channelId: query.channelId,
  }
  return request(`/api/dj/difm/playing/tracks/list`, data, createOption(query))
}

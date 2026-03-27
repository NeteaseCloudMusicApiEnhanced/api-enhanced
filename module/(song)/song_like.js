// 喜欢歌曲

const createOption = require('../../util/option.js')
module.exports = (query, request) => {
  const like = query.like !== 'false'
  const data = {
    trackId: query.id,
    userid: query.uid,
    like: like,
  }
  return request(`/api/song/like`, data, createOption(query))
}

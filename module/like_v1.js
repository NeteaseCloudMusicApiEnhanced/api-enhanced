// 红心与取消红心歌曲- v1

const createOption = require('../util/option.js')
module.exports = (query, request) => {
  query.like = query.like == 'false' ? false : true
  const data = {
    alg: 'itembased',
    trackId: query.id,
    like: query.like,
    time: '3',
  }
  return request(`/api/v1/radio/like`, data, createOption(query, 'xeapi', 'v3'))
}

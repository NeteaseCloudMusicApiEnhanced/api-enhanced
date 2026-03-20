// 获取云盘歌词
const createOption = require('../../util/option.js')
module.exports = (query, request) => {
  const data = {
    userId: query.uid,
    songId: query.sid,
    lv: -1,
    kv: -1,
  }
  return request(`/api/cloud/lyric/get`, data, createOption(query, 'eapi'))
}

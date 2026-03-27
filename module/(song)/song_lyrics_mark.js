// 歌词摘录 - 歌词摘录信息

const createOption = require('../../util/option.js')
module.exports = (query, request) => {
  const data = {
    songId: query.id,
  }
  return request(`/api/song/play/lyrics/mark/song`, data, createOption(query))
}

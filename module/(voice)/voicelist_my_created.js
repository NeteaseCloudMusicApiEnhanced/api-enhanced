// 我创建的播客声音

const createOption = require('../../util/option.js')
module.exports = (query, request) => {
  const data = {
    limit: query.limit || 20,
  }
  return request(
    `/api/social/my/created/voicelist/v1`,
    data,
    createOption(query, 'weapi'),
  )
}

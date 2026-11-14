// 评论默认文案

const createOption = require('../util/option.js')
module.exports = (query, request) => {
  const data = {
    threadId: query.threadId,
  }
  return request(
    `/api/comment/default/text`,
    data,
    createOption(query, 'weapi'),
  )
}

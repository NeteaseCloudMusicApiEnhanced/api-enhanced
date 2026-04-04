// 删除评论

const createOption = require('../util/option.js')
module.exports = (query, request) => {
  const data = {
    commentId: query.cid,
    threadId: 'R_SO_4_' + query.id,
  }
  return request(`/api/resource/comments/delete`, data, createOption(query))
}

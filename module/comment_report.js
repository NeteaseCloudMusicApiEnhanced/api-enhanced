// 举报评论

const createOption = require('../util/option.js')
module.exports = (query, request) => {
  const data = {
    threadId: 'R_SO_4_' + query.id,
    commentId: query.cid,
    reason: query.reason,
  }
  return request(`/api/report/reportcomment`, data, createOption(query))
}

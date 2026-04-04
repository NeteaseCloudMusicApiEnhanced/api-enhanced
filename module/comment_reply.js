// 回复评论

const createOption = require('../util/option.js')
module.exports = (query, request) => {
  const data = {
    threadId: query.id,
    commentId: query.commentId,
    content: query.content,
    resourceType: '0',
    resourceId: '0',
  }
  return request(`/api/v1/resource/comments/reply`, data, createOption(query))
}

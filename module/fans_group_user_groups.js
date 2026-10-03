// 获取当前登录用户加入的全部歌手乐迷团列表

const createOption = require('../../util/option.js')

module.exports = (query, request) => {
  return request(
    '/api/social/fansgroup/bff/user/groups/get',
    {},
    createOption(query, 'eapi'),
  )
}

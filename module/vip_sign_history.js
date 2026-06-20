// 黑胶乐签打卡历史

const createOption = require('../util/option.js')
module.exports = (query, request) => {
  const data = {
    type: '0',
  }
  return request(
    `/api/vipnewcenter/app/minidesk/music/sign/pc`,
    data,
    createOption(query, 'xeapi'),
  )
}

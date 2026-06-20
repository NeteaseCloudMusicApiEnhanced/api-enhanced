// 黑胶乐签打卡详情

const createOption = require('../util/option.js')
module.exports = (query, request) => {
  const data = {
    signDayTime: query.timestamp,
    type: '1',
  }
  return request(
    `/api/vipnewcenter/app/level/user/checkin/history/detail`,
    data,
    createOption(query, 'eapi'),
  )
}

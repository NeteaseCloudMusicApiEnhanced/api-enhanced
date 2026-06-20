// 会员任务 - 新版

const createOption = require('../util/option.js')
module.exports = (query, request) => {
  const data = {
    taskType: 'app_vip_task_center',
    userId: query.id,
  }
  return request(
    `/api/middle/vip/mission/user/progress/list`,
    data,
    createOption(query, 'xeapi'),
  )
}

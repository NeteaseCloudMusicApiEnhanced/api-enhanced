// 会员任务 - v1

const createOption = require('../util/option.js')

module.exports = (query, request) => {
  const data = {
    taskType: 'app_vip_task_center',
    userId: query.userId || '',
  }

  return request(
    `/api/middle/vip/mission/user/progress/list`,
    data,
    createOption(query, 'xeapi'),
  )
}

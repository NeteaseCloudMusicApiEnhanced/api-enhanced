// 云贝广告任务 - 查询今日任务状态
// 逆向来源: 云贝任务中心 H5 (st.music.163.com/yunbei-listen) main.js
// GET /api/ad/power/yunbei/distribution/list
// 返回: { times: 今日已完成次数, amount: 今日累计云贝, singleAmount: 单次可得云贝 }
// 注意: 单日上限 10 次, 单次 150 云贝 (每天最多 1500)

const createOption = require('../util/option.js')

module.exports = (query, request) => {
  const data = {}
  return request(
    `/api/ad/power/yunbei/distribution/list`,
    data,
    createOption(query, 'weapi'),
  )
}

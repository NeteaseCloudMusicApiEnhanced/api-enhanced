// 云贝广告任务 - 完成任务领取云贝
// 逆向来源: 云贝任务中心 H5 (st.music.163.com/yunbei-listen) main.js
// POST /api/ad/power/yunbei/distribution/create
// 参数: yunbeiAmount (单次可得云贝, 客户端从 list 接口的 singleAmount 取值, 当前为 150)
// 返回: true (领取成功)
//
// 实测验证 (2026-08-05):
//   - 仅传 yunbeiAmount 即可成功领取, 无需真实听歌/看视频
//   - 单日上限 10 次 × 150 云贝 = 1500 云贝/天
//   - 超限返回 code:400 "单日完成任务数已达上限"
//   - 无频率限制, 800ms 间隔连续调用均成功
//
// 建议: 领取前先调 yunbei_ad_task_list 查询 times, 达到 10 次即停止

const createOption = require('../util/option.js')

module.exports = (query, request) => {
  const data = {
    yunbeiAmount: query.yunbeiAmount || 150,
  }
  return request(
    `/api/ad/power/yunbei/distribution/create`,
    data,
    createOption(query, 'weapi'),
  )
}

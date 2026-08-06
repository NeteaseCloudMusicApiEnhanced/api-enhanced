const {
  login_cellphone,
  yunbei_ad_task_list,
  yunbei_ad_task_recommend_song,
  yunbei_ad_task_finish,
} = require('../main')

// 云贝广告任务(听歌/看视频得云贝)完整流程示例
// 1. list    - 查询今日任务状态(次数/云贝)
// 2. finish  - 领取云贝, 仅需传 yunbeiAmount(单次 150), 无需真实听歌/看视频
// 3. recommend/song - 可选, 获取推荐歌曲列表
// 注意: 单日上限 10 次 x 150 = 1500 云贝/天

async function main() {
  const login = await login_cellphone({
    phone: '手机号',
    password: '密码',
  })
  const cookie = login.body.cookie

  // 1. 查询今日任务状态
  const list = await yunbei_ad_task_list({ cookie })
  const { times, amount, singleAmount } = list.body
  console.log(
    `今日已完成 ${times} 次, 累计 ${amount} 云贝, 单次可得 ${singleAmount} 云贝`,
  )
  if (times >= 10) {
    console.log('已达单日上限, 明天再来吧')
    return
  }

  // 2. 领取云贝(单次 150)
  const finish = await yunbei_ad_task_finish({
    yunbeiAmount: singleAmount,
    cookie,
  })
  console.log('领取结果:', finish.body)

  // 3. 获取推荐歌曲(听歌任务专属推荐, 可选)
  const rcmd = await yunbei_ad_task_recommend_song({
    offset: 0,
    limit: 10,
    cookie,
  })
  console.log('推荐歌曲:', rcmd.body.map((s) => s.songName).join(', '))
}

main()

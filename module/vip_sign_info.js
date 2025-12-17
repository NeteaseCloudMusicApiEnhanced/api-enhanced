// 黑胶乐签签到信息

const createOption = require('../util/option.js')
module.exports = (query, request) => {
    const data = {}
    // 获取黑胶乐签签到记录
    return request(
        `/api/vipnewcenter/app/user/sign/info`,
        data,
        createOption(query, 'weapi'),
    )
}

// 黑胶乐签打卡 - 测试脚本

const createOption = require('../util/option.js')
module.exports = (query, request) => {
    const data = {}
    // 黑胶乐签打卡API (来自chaunsin/netease-cloud-music项目)
    return request(
        `/api/vip-center-bff/task/sign`,
        data,
        createOption(query, 'weapi'),
    )
}

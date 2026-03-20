
////////////////////////////////////////////////////////////////////////////////////////
// @NOTE: Module Template 文件
// @brief 这个文件必须按照 _ （下划线）来做分割，来表示请求路径
// `momo_hello` 为文件名的话，我们请求路径就应该为 /momo/hello
// 如果前面有目录的话，例如 `/v1/search/momo_hello`，那么客户端发送的请求就应该为 /v1/search/momo/hello
////////////////////////////////////////////////////////////////////////////////////////

// 这里填写接口用处, 例如: 获取用户的收藏列表
const createOption = require('../../../util/option.js')
module.exports = (query, request) => {
    const data = { lastQuery: query.lastQuery }
    return request(`/api/search/pc/rcmd/keyword/get`, data, createOption(query))
}

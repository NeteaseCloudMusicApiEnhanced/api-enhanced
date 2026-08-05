// 易盾反作弊 Token 注册端点
// 调用后获取实时 token 并存入共享存储，供后续带 checkToken 的请求使用
//
// GET  /register/checktoken        → 实时获取新 token（不缓存）
// POST /register/checktoken        → 实时获取新 token
//
// 注意：每次获取都不缓存，模拟真实客户端每次请求使用新鲜 token，
// 避免反作弊 token 复用触发风控。
//
const { default: axios } = require('axios')
const { APP_CONF } = require('../util/config.json')

const URL = APP_CONF.dunDomainV2 + '/v2/config/js?pn=YD00000558929251'

async function fetch() {
  const res = await axios.get(URL, { timeout: 10000 })
  const data = res.data
  if (data && data.code === 200 && data.result && data.result.conf) {
    return data.result.conf
  }
  throw new Error('易盾返回异常: ' + JSON.stringify(data).substring(0, 200))
}

// 端点处理：每次实时获取新 token
module.exports = async () => {
  let token = ''
  try {
    token = await fetch()
  } catch (e) {
    // token 获取失败时返回空，由调用方决定是否重试
  }
  return {
    status: 200,
    body: { code: 200, token, registered: !!token },
  }
}

// 给 request.js 读取用：每次调用实时获取新 token，不缓存
module.exports.getToken = async () => {
  try {
    return await fetch()
  } catch (e) {
    return ''
  }
}

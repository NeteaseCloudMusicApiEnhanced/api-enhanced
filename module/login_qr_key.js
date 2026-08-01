const createOption = require('../util/option.js')
const {
  createWebQrOption,
  mergeCookieLists,
} = require('../util/web_qr_login.js')
module.exports = async (query, request) => {
  const platform = query.platform || 'web'
  const data = {
    type: platform === 'web' ? 1 : 3,
  }
  if (platform === 'web') {
    data.noCheckToken = true
    if (query.lastUnikey) data.lastUnikey = query.lastUnikey
  }
  const option =
    platform === 'web' ? createWebQrOption(query) : createOption(query, '')

  const result = await request(`/api/login/qrcode/unikey`, data, option)
  const cookies =
    platform === 'web'
      ? mergeCookieLists(option.webQrCookieSet, result.cookie)
      : result.cookie
  return {
    status: 200,
    body: {
      data: result.body,
      code: 200,
    },
    cookie: cookies,
  }
}

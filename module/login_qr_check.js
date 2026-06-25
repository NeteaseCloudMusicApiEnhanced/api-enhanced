const createOption = require('../util/option.js')
const { generateChainId } = require('../util/index')
const {
  createWebQrOption,
  mergeCookieLists,
} = require('../util/web_qr_login.js')

const qrLoginChainIds =
  globalThis.__neteaseQrLoginChainIds ||
  (globalThis.__neteaseQrLoginChainIds = new Map())

module.exports = async (query, request) => {
  const platform = query.platform || 'web'
  const chainId =
    query.chainId ||
    qrLoginChainIds.get(String(query.key)) ||
    (platform === 'web' ? generateChainId(query.cookie || '') : '')
  const data = {
    key: query.key,
    type: platform === 'web' ? 1 : 3,
  }
  if (platform === 'web') data.ydDeviceToken = query.ydDeviceToken || ''

  let option = createOption(query, '')
  if (platform === 'web') {
    option = createWebQrOption(query, {
      'X-LoginMethod': 'QrCode',
      'X-Login-Chain-Id': chainId,
    })
  }

  try {
    let result = await request(`/api/login/qrcode/client/login`, data, option)
    if ([800, 803].includes(result.body.code)) {
      qrLoginChainIds.delete(String(query.key))
    }
    result = {
      status: 200,
      body: {
        ...result.body,
        cookie: mergeCookieLists(option.webQrCookieSet, result.cookie).join(
          ';',
        ),
      },
      cookie: mergeCookieLists(option.webQrCookieSet, result.cookie),
    }
    return result
  } catch (error) {
    if ([800, 803].includes(error.body && error.body.code)) {
      qrLoginChainIds.delete(String(query.key))
    }
    return {
      status: 200,
      body: error.body || {},
      cookie:
        platform === 'web'
          ? mergeCookieLists(option.webQrCookieSet, error.cookie)
          : error.cookie || [],
    }
  }
}

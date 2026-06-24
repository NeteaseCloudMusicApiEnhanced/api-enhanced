const createOption = require('../util/option.js')
const { generateChainId } = require('../util/index')

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
    type: 3,
  }
  const option = createOption(query, platform === 'web' ? 'weapi' : '')

  if (platform === 'web') {
    option.headers = {
      ...option.headers,
      Referer: 'https://music.163.com/',
      Origin: 'https://music.163.com',
      'X-LoginMethod': 'QrCode',
      'X-Login-Chain-Id': chainId,
      'X-OS': 'web',
      'X-ChannelSource': 'undefined',
      'NM-GCORE-STATUS': '1',
    }
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
        cookie: result.cookie.join(';'),
      },
      cookie: result.cookie,
    }
    return result
  } catch (error) {
    if ([800, 803].includes(error.body && error.body.code)) {
      qrLoginChainIds.delete(String(query.key))
    }
    return {
      status: 200,
      body: error.body || {},
      cookie: error.cookie || [],
    }
  }
}

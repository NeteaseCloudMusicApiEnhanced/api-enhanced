const QRCode = require('qrcode')
const { generateChainId } = require('../util/index')

const qrLoginChainIds =
  globalThis.__neteaseQrLoginChainIds ||
  (globalThis.__neteaseQrLoginChainIds = new Map())

module.exports = (query) => {
  return new Promise(async (resolve) => {
    const platform = query.platform || 'web'
    const cookie = query.cookie || ''
    const chainId =
      platform === 'web' ? query.chainId || generateChainId(cookie) : ''

    if (query.key && chainId) {
      qrLoginChainIds.set(String(query.key), chainId)
    }

    // 构建基础URL
    let url = `https://music.163.com/login?codekey=${query.key}`

    // 如果是web平台，则添加chainId参数

    if (platform === 'web') {
      url += `&chainId=${encodeURIComponent(chainId)}`
    }
    return resolve({
      code: 200,
      status: 200,
      body: {
        code: 200,
        data: {
          qrurl: url,
          qrimg: query.qrimg ? await QRCode.toDataURL(url) : '',
          chainId,
        },
      },
    })
  })
}

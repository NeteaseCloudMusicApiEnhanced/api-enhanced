const { default: axios } = require('axios')
const encrypt = require('../util/crypto')
const { APP_CONF } = require('../util/config.json')
const runtimeState = require('../util/runtimeState')

const REQUEST_TIMEOUT = 15000
const INTERNAL_STATE_TOKEN = Symbol('internal xeapi state update')
const CURRENT_KEY_TOKEN = Symbol('trusted current xeapi key')

const generateNonce = () => {
  let nonce = ''
  for (let i = 0; i < 16; i++) {
    nonce += Math.floor(Math.random() * 10).toString()
  }
  return nonce
}

module.exports = async (query, request) => {
  const nonce = generateNonce()
  const timestamp = String(Date.now())
  const deviceId = query.deviceId || global.deviceId || ''
  const currentKeyVersion = query.currentKeyVersion || ''

  const data = {
    appVersion: '9.5.61',
    currentKeyVersion,
    deviceId,
    nonce,
    os: 'android',
    requestType: 'active',
    signature: encrypt.xeapiSign(timestamp, nonce),
    t1: '',
    t2: '',
    timestamp,
    uid: '',
  }

  const res = await axios({
    method: 'POST',
    url: APP_CONF.apiDomain + '/api/bsr/sk/get',
    headers: {
      'User-Agent':
        'NeteaseMusic/9.5.61.260802021928(9005061);Dalvik/2.1.0 (Linux; U; Android 12; HBN-AL00 Build/cd737a2.0)',
      Cookie: deviceId ? `deviceId=${encodeURIComponent(deviceId)}` : '',
    },
    data: new URLSearchParams(data).toString(),
    proxy: false,
    timeout: REQUEST_TIMEOUT,
  })

  if (
    !res.data ||
    res.data.code !== 200 ||
    !res.data.data ||
    !res.data.data.encryptedData
  ) {
    throw new Error('xeapi public key request failed')
  }
  if (
    !res.data.data.signature ||
    encrypt.xeapiSign(res.data.data.timestamp, nonce) !==
      res.data.data.signature
  ) {
    throw new Error('xeapi public key response signature mismatch')
  }

  const publicKey = encrypt.xeapiDecryptPublicKey(res.data.data.encryptedData)
  const previousKey =
    query.currentPublicKeyToken === CURRENT_KEY_TOKEN
      ? query.currentPublicKey || {}
      : {}
  if (!publicKey.sk && previousKey.sk) {
    publicKey.sk = previousKey.sk
  }
  if (!publicKey.sk) {
    throw new Error('xeapi public key response missing sk')
  }

  // 获取成功后立即写入运行时状态，供 util/request.js 的 xeapi 请求使用
  if (query.updateRuntimeState === INTERNAL_STATE_TOKEN) {
    runtimeState.xeapiPublicKey = { ...publicKey, deviceId }
  }

  return {
    status: 200,
    body: {
      ...publicKey,
      deviceId,
    },
    cookie: [],
  }
}

module.exports.INTERNAL_STATE_TOKEN = INTERNAL_STATE_TOKEN
module.exports.CURRENT_KEY_TOKEN = CURRENT_KEY_TOKEN

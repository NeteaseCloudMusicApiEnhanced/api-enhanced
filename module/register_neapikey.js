const { default: axios } = require('axios')
const { APP_CONF } = require('../util/config.json')
const { saveNeapiKey } = require('../util/neapiKey')
const { decodeConfig } = require('../util/neapiConfig')

const USER_AGENT =
  'NeteaseMusic/9.5.61.260802021928(9005061);Dalvik/2.1.0 (Linux; U; Android 12; HBN-AL00 Build/cd737a2.0)'

module.exports = async (query, request) => {
  const version = Number(query.version) || 0
  const behavior = query.behavior === 'update' ? 'update' : 'open'

  const res = await axios({
    method: 'GET',
    url: APP_CONF.apiDomain + '/api/gorilla/algorithm/record',
    params: { version, behavior },
    headers: { 'User-Agent': USER_AGENT },
    proxy: false,
  })

  if (!res.data || res.data.code !== 200 || !res.data.data) {
    throw new Error('neapi config request failed')
  }

  // file 为空表示本地已是最新，无需更新
  const { file, circleTime } = res.data.data
  const config = file
    ? saveNeapiKey(decodeConfig(Buffer.from(file, 'base64')), circleTime)
    : null

  // 只回版本与密钥偏移，密钥本身留在本地缓存
  const keyOffsets = {}
  if (config) {
    keyOffsets.encrypt = config.keyBlob.indexOf(config.encryptKey)
    keyOffsets.decrypt = config.keyBlob.indexOf(config.decryptKey)
  }

  return {
    status: 200,
    body: {
      version: config ? config.version : res.data.data.version,
      updated: Boolean(config),
      circleTime,
      keyOffsets,
    },
    cookie: [],
  }
}

const fs = require('fs')
const path = require('path')

// 配置会轮换，启动时由 /register/neapikey 拉取后缓存到这里
const neapiKeyPath = path.resolve(require('os').tmpdir(), 'neapi_key')

let neapi_key = null

const loadNeapiKey = () => {
  if (!neapi_key && fs.existsSync(neapiKeyPath)) {
    try {
      const stored = JSON.parse(fs.readFileSync(neapiKeyPath, 'utf-8'))
      neapi_key = {
        version: stored.version,
        circleTime: stored.circleTime,
        fetchedAt: stored.fetchedAt,
        keyBlob: Buffer.from(stored.keyBlob, 'base64'),
        encryptKey: Buffer.from(stored.encryptKey, 'base64'),
        decryptKey: Buffer.from(stored.decryptKey, 'base64'),
      }
    } catch (error) {
      console.log('[ERR]', error)
    }
  }
  return neapi_key
}

const saveNeapiKey = (config, circleTime) => {
  const fetchedAt = Date.now()
  fs.writeFileSync(
    neapiKeyPath,
    JSON.stringify({
      version: config.version,
      circleTime,
      fetchedAt,
      keyBlob: config.keyBlob.toString('base64'),
      encryptKey: config.encryptKey.toString('base64'),
      decryptKey: config.decryptKey.toString('base64'),
    }),
    'utf-8',
  )
  neapi_key = { ...config, circleTime, fetchedAt }
  return neapi_key
}

module.exports = {
  loadNeapiKey,
  saveNeapiKey,
}

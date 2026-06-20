const registerXeapiKey = require('../module/register_xeapikey')

const getXeapiPublicKey = async (currentPublicKey = {}, deviceId = '') => {
  const result = await registerXeapiKey(
    {
      deviceId,
      currentKeyVersion: currentPublicKey.version || '',
    },
    null,
  )

  const publicKey = result.body
  if (!publicKey.sk && currentPublicKey.sk) {
    publicKey.sk = currentPublicKey.sk
  }
  if (!publicKey.sk) {
    throw new Error('xeapi public key response missing sk')
  }
  return publicKey
}

module.exports = {
  getXeapiPublicKey,
}

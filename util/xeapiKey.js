// Compatibility shim for consumers importing this historical deep path.
const registerXeapiKey = require('../module/register_xeapikey')

const getXeapiPublicKey = async (currentPublicKey = {}, deviceId = '') => {
  const result = await registerXeapiKey(
    {
      deviceId,
      currentKeyVersion: currentPublicKey.version || '',
      currentPublicKey,
      currentPublicKeyToken: registerXeapiKey.CURRENT_KEY_TOKEN,
    },
    null,
  )
  return result.body
}

module.exports = { getXeapiPublicKey }

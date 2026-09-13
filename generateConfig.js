const runtimeState = require('./util/runtimeState')
const { generateRandomChineseIP } = require('./util/index')

/**
 * 启动/预热配置。
 *
 */
async function generateConfig() {
  global.cnIp = generateRandomChineseIP()

  // 先加载可选种子，保证网络刷新失败时仍有可用值（迁移/降级）。
  runtimeState.loadSeed()

  // 启动时主动刷新匿名 token；失败则退回到种子（可能为空，由请求层按需兜底）。
  try {
    const { refreshAnonymousToken } = require('./util/credentials')
    await refreshAnonymousToken()
  } catch (error) {
    console.log(error)
  }

  try {
    const { fetchXeapiPublicKey } = require('./util/credentials')
    const publicKey = await fetchXeapiPublicKey()
    runtimeState.mergeXeapiPublicKey(publicKey)
  } catch (error) {
    console.log(error)
  }
}

module.exports = generateConfig

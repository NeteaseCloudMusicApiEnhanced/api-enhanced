const request = require('./util/request')
const { generateRandomChineseIP, generateDeviceId } = require('./util/index')
const { loadNeapiKey } = require('./util/neapiKey')
const registerNeapikey = require('./module/register_neapikey')

/**
 * 启动 / 手动刷新运行时动态配置。
 *
 * 凭证均存于内存（util/runtimeState.js），不做任何文件 I/O：
 * - 设备 ID 先行 —— xeapi 公钥注册需携带 deviceId（服务端对无
 *   deviceId 的请求不下发 sk），匿名注册也复用同一设备身份；
 * - xeapi 公钥其次 —— 注册匿名令牌走 xeapi 加密，依赖该公钥；
 * - 匿名令牌最后注册，三者就绪后冷启动一次即可完成引导。
 */
async function generateConfig() {
  global.cnIp = generateRandomChineseIP()
  if (!global.deviceId) {
    global.deviceId = generateDeviceId()
  }
  try {
    await request.refreshXeapiPublicKey()
  } catch (error) {
    console.log(error)
  }
  try {
    await request.refreshAnonymousToken()
  } catch (error) {
    console.log(error)
  }
  try {
    const current = loadNeapiKey()
    await registerNeapikey(
      {
        version: current ? current.version : 0,
        behavior: current ? 'update' : 'open',
      },
      null,
    )
  } catch (error) {
    console.log(error)
  }
}

module.exports = generateConfig

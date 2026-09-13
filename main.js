const fs = require('fs')
const path = require('path')
const { cookieToJson } = require('./util')

/** @type {Record<string, any>} */
let obj = {}

const modulePath = path.join(__dirname, 'module')
const moduleFiles = fs.readdirSync(modulePath).reverse()

let requestModule = null

moduleFiles.forEach((file) => {
  if (!file.endsWith('.js')) return

  const filePath = path.join(modulePath, file)
  let fileModule = require(filePath)
  let fn = file.split('.').shift() || ''

  obj[fn] = function (data = {}) {
    const cookie =
      typeof data.cookie === 'string'
        ? cookieToJson(data.cookie)
        : data.cookie || {}

    return fileModule(
      {
        ...data,
        cookie,
      },
      async (...args) => {
        if (!requestModule) {
          requestModule = require('./util/request')
        }

        return requestModule(...args)
      },
    )
  }
})

let serverModule = null
let generateConfigModule = null

/**
 * @type {Record<string, any> & import("./server")}
 */
module.exports = {
  get server() {
    if (!serverModule) {
      serverModule = require('./server')
    }
    return serverModule
  },
  /**
   * 刷新运行时动态配置（匿名令牌 / xeapi 公钥，存于内存 runtimeState）。
   * 作为依赖使用时可以不调用——首个请求会在凭证缺失时自动引导；
   * 需要预热或手动续期时再 `await main.generateConfig()`。
   */
  get generateConfig() {
    if (!generateConfigModule) {
      generateConfigModule = require('./generateConfig')
    }
    return generateConfigModule
  },
  ...obj,
}

Object.assign(module.exports, require('./server'))

const fs = require('fs')
const path = require('path')
const tmpPath = require('os').tmpdir()
const { cookieToJson } = require('./util')

const anonymousTokenPath = path.resolve(tmpPath, 'anonymous_token')
if (!fs.existsSync(anonymousTokenPath)) {
  fs.writeFileSync(anonymousTokenPath, '', 'utf-8')
}

/** @type {Record<string, any>} */
let obj = {}

// 当打包后运行时，__dirname会指向bundle.js的位置，需要回退到上级目录查找module
// 检查当前目录下是否存在module文件夹，如果不存在则尝试在上级目录查找
// 如果上级目录也不存在，抛出错误
let modulePath = path.join(__dirname, 'module')
if (!fs.existsSync(modulePath)) {
  modulePath = path.join(__dirname, '..', 'module')
}
if (!fs.existsSync(modulePath)) {
  throw new Error(
    `Module directory not found at ${path.join(__dirname, 'module')} or ${modulePath}`,
  )
}

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
  ...obj,
}

Object.assign(module.exports, require('./server'))

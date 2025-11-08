const fs = require('fs')
const path = require('path')
const tmpPath = require('os').tmpdir()
const { generateRandomChineseIP } = require('./util/index')

if (!fs.existsSync(path.resolve(tmpPath, 'anonymous_token'))) {
  fs.writeFileSync(path.resolve(tmpPath, 'anonymous_token'), '', 'utf-8')
}

global.cnIp = generateRandomChineseIP()

const { consturctServer } = require('./server')
let app = null

module.exports = async (req, res) => {
  if (!app) {
    try {
      const generateConfig = require('./generateConfig')
      generateConfig().catch((e) =>
        console.error('generateConfig failed:', e.message),
      )
    } catch (e) {}
    app = await consturctServer()
  }
  return app(req, res)
}

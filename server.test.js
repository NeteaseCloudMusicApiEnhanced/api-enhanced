const fs = require('fs')
const path = require('path')
const homePath = require('./util').getUserDir()
/** @type {import("express").Express & serverMod.ExpressExtension} */
let app
if (!fs.existsSync(path.resolve(homePath, 'anonymous_token'))) {
  fs.writeFileSync(path.resolve(homePath, 'anonymous_token'), '', 'utf-8')
}
const serverMod = require('./server')
before(async () => {
  const generateConfig = require('./generateConfig')
  await generateConfig()
  app = await serverMod.serveNcmApi({})

  if (app.server && app.server.address) {
    const addr = app.server.address()
    if (addr && typeof addr === 'object' && 'port' in addr) {
      global.host = `http://localhost:${addr.port}`
      return
    }
  }

  throw new Error('failed to set up host')
})

after((done) => {
  if (app.server) {
    app.server.close(done)
    return
  }

  throw new Error('failed to set up server')
})

fs.readdirSync(path.join(__dirname, 'test')).forEach((file) => {
  require(path.join(__dirname, 'test', file))
})

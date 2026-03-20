const fs = require('fs')
const path = require('path')
const register_anonimous = require('./module/(auth)/register_anonimous')
const { cookieToJson, generateRandomChineseIP } = require('./util/index')
const request = require('./util/request')
const tmpPath = require('os').tmpdir()

async function generateConfig() {
  global.cnIp = generateRandomChineseIP()
  try {
    const res = await register_anonimous({}, request)
    const cookie = res.body.cookie
    if (cookie) {
      const cookieObj = cookieToJson(cookie)
      fs.writeFileSync(
        path.resolve(tmpPath, 'anonymous_token'),
        cookieObj.MUSIC_A,
        'utf-8',
      )
    }
  } catch (error) {
    console.log(error)
  }
}
module.exports = generateConfig

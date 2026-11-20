#!/usr/bin/env node
const fs = require('fs')
const path = require('path')
const homePath = require('./util').getUserDir()

async function start() {
  // 检测是否存在 anonymous_token 文件,没有则生成
  if (!fs.existsSync(path.resolve(homePath, 'anonymous_token'))) {
    fs.writeFileSync(path.resolve(homePath, 'anonymous_token'), '', 'utf-8')
  }
  // 启动时更新anonymous_token
  const generateConfig = require('./generateConfig')
  await generateConfig()
  require('./server').serveNcmApi({
    checkVersion: true,
  })
}
start()

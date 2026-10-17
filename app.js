#!/usr/bin/env node
const fs = require('fs')
const path = require('path')
const tmpPath = require('os').tmpdir()

// engines 字段只在 npm/pnpm 安装时生效，直接 node app.js 不会被拦截，
// 这里给出友好的最低版本检查（>=22，与 package.json engines 保持一致）
const [major] = process.versions.node.split('.').map(Number)
if (major < 22) {
  console.error(
    `[${new Date().toLocaleString()}] Node.js >= 22 is required (current: ${process.versions.node}). ` +
      '请升级 Node.js 后重试 / Please upgrade Node.js to v22 or newer.',
  )
  process.exit(1)
}

async function start() {
  // 检测是否存在 anonymous_token 文件,没有则生成
  if (!fs.existsSync(path.resolve(tmpPath, 'anonymous_token'))) {
    fs.writeFileSync(path.resolve(tmpPath, 'anonymous_token'), '', 'utf-8')
  }
  // 启动时更新anonymous_token
  const generateConfig = require('./generateConfig')
  await generateConfig()
  require('./server').serveNcmApi({
    checkVersion: true,
  })
}
start()

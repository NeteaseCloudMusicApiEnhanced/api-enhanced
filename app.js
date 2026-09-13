#!/usr/bin/env node

async function start() {
  // 启动时预热运行时凭证（纯内存，不依赖 /tmp 等可写文件系统）
  const generateConfig = require('./generateConfig')
  await generateConfig()
  require('./server').serveNcmApi({
    checkVersion: true,
  })
}
start()

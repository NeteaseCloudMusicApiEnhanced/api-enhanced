#!/usr/bin/env node

async function start() {
  // 启动时预热运行时凭证（匿名令牌 / xeapi 公钥，均存于内存中的 runtimeState）
  const generateConfig = require('./generateConfig')
  await generateConfig()
  require('./server').serveNcmApi({
    checkVersion: true,
  })
}
start()

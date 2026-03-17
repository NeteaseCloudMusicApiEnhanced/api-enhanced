#!/usr/bin/env node
const fs = require('fs')
const path = require('path')
const tmpPath = require('os').tmpdir()

async function start() {
  // 检测是否存在 anonymous_token 文件,没有则生成
  if (!fs.existsSync(path.resolve(tmpPath, 'anonymous_token'))) {
    fs.writeFileSync(path.resolve(tmpPath, 'anonymous_token'), '', 'utf-8')
  }
  // 启动时更新anonymous_token
  const generateConfig = require('./generateConfig')
  await generateConfig()

  // 端口优先级: 环境变量 PORT > 外部配置文件 > 默认 3838
  let configPort = Number.parseInt(process.env.PORT || '', 10);
  if (!Number.isFinite(configPort) || configPort <= 0) {
    configPort = 3838;
    const configPath = process.env.APP_CONFIG_PATH || path.resolve(__dirname, '../../config/app.config.yml');
    const defaultPath = path.resolve(__dirname, '../../config/app.config.default.yml');
    const actualPath = fs.existsSync(configPath) ? configPath : defaultPath;

    try {
      const yaml = require('js-yaml');
      const cfg = yaml.load(fs.readFileSync(actualPath, 'utf-8'));
      if (cfg && cfg.backend && cfg.backend.port) {
        configPort = cfg.backend.port;
      }
    } catch (e) {
      console.error('[Backend] Failed to load port from config, using default 3838:', e.message);
    }
  }

  require('./server').serveNcmApi({
    checkVersion: true,
    port: configPort
  })
}
start()

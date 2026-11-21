const runtimeState = require('./runtimeState')

// 配置会轮换，启动时由 /register/neapikey 拉取后缓存在进程内。
// 不写入临时目录，兼容只读文件系统和 serverless 环境。

const loadNeapiKey = () => {
  return runtimeState.neapiKey
}

const saveNeapiKey = (config, circleTime) => {
  const fetchedAt = Date.now()
  runtimeState.neapiKey = { ...config, circleTime, fetchedAt }
  return runtimeState.neapiKey
}

module.exports = {
  loadNeapiKey,
  saveNeapiKey,
}

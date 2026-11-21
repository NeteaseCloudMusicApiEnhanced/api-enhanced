// 统一的运行时动态状态存储（仅内存，不落盘）
//
// 存放需要在进程内共享、且会在运行期间变化的动态配置，
// 目前包括匿名令牌（MUSIC_A）与 xeapi 公钥。
//
// 设计约定：
// - 只存在于内存中，不做任何文件 I/O —— 在没有 /tmp 或临时目录
//   不可写的平台（Android / iOS / 嵌入式 / serverless）上同样可用
// - 写入方（module/register_anonimous.js、module/register_xeapikey.js）
//   在成功获取新值后立即写入，读取方（util/request.js）每次请求实时读取，
//   进程内即时生效，无需重启
// - 凭证缺失时可通过 ensure() 按需刷新，并发调用共享同一次刷新任务
// - 以后新增的动态配置请放在这里，不要再往 os.tmpdir() 写文件

const runtimeState = {
  /** 匿名令牌（MUSIC_A cookie），由 module/register_anonimous.js 成功后写入 */
  anonymousToken: '',

  /**
   * xeapi 公钥（含 sk / version / deviceId 等字段），
   * 由 module/register_xeapikey.js 成功后写入
   */
  xeapiPublicKey: null,

  /** neapi 配置，进程内缓存，避免依赖可写临时目录 */
  neapiKey: null,
}

/** 进行中的按需刷新任务：并发调用共享同一次刷新，避免重复请求 */
const refreshTasks = new Map()
const refreshFailures = new Map()

/**
 * 确保某项动态状态可用：已有值时直接返回；缺失时执行 refresh 刷新
 * （refresh 成功后需自行把新值写入 runtimeState[key]）。
 * 并发调用会共享同一个进行中的刷新任务。
 *
 * @param {string} key runtimeState 上的字段名
 * @param {() => Promise} refresh 刷新函数
 * @param {{ retryDelay?: number }} [options] 失败后的最短重试间隔
 * @returns {Promise<*>} 该状态当前的值（刷新失败时抛出错误）
 */
runtimeState.ensure = async (key, refresh, options = {}) => {
  if (runtimeState[key]) return runtimeState[key]

  const retryDelay = options.retryDelay || 0
  const failure = refreshFailures.get(key)
  if (failure && failure.until > Date.now()) {
    throw failure.error
  }

  if (!refreshTasks.has(key)) {
    refreshTasks.set(
      key,
      Promise.resolve()
        .then(refresh)
        .then((value) => {
          refreshFailures.delete(key)
          return value
        })
        .catch((error) => {
          if (retryDelay > 0) {
            refreshFailures.set(key, {
              error,
              until: Date.now() + retryDelay,
            })
          }
          throw error
        })
        .finally(() => {
          refreshTasks.delete(key)
        }),
    )
  }

  await refreshTasks.get(key)
  return runtimeState[key]
}

module.exports = runtimeState

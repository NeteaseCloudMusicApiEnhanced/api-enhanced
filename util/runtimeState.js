/**
 * 统一运行时状态容器。
 *
 * 历史上 anonymous_token / xeapi_public_key 以“文件当 IPC”的方式存放在
 * os.tmpdir()（/tmp）。这在可移植性上存在两个问题：
 *  1. 并非所有平台都提供可写的 /tmp（如 Android / iOS / 嵌入式 / serverless）；
 *  2. main.js / request.js 会在 require 阶段就执行文件 I/O，只读文件系统上直接
 *     导致模块加载失败。
 *
 * 但这些值本质上只是进程内的动态配置，读写双方都在同一个进程里，完全没有
 * 落盘的必要。本模块把它们收敛到统一的内存状态：
 *  - 默认纯内存，get/set 绝不做任何文件 I/O（可在只读 FS / serverless 安全使用）；
 *  - 可选地通过 loadSeed() 从环境变量或旧 /tmp 文件读取“种子”，仅用于平滑迁移；
 *  - 支持懒加载与按需刷新，适配 serverless 冷启动（不假设启动时已刷新过）。
 */

const fs = require('fs')
const path = require('path')
const os = require('os')

/** @type {string} */
let anonymousToken = ''
/** @type {Record<string, any> | null} */
let xeapiPublicKey = null

/** 进行中的刷新 Promise，用于并发去重 */
let anonymousTokenTask = null
let xeapiPublicKeyTask = null

/**
 * 防重入标记：刷新凭证本身也要走 util/request 发 HTTP 请求，
 * 若不跳过 request 层的“缺失即刷新”逻辑，会等待自己造成死锁。
 */
let anonymousTokenRefreshing = false
let xeapiPublicKeyRefreshing = false

/** 旧版本遗留的磁盘路径，仅作为可选迁移种子读取，永不写入 */
const legacyTmpPath = (() => {
  try {
    return os.tmpdir()
  } catch (_) {
    return ''
  }
})()

const safeReadFile = (filePath) => {
  if (!filePath) return null
  try {
    return fs.readFileSync(filePath, 'utf-8')
  } catch (_) {
    // 文件不存在 / 不可读 / 只读文件系统：静默降级
    return null
  }
}

/**
 * 读取 anonymous_token 的可选种子（环境变量优先，其次旧 /tmp 文件）。
 * 仅在显式调用时读取，绝不在 require 阶段触发。
 * @returns {string}
 */
const readAnonymousTokenSeed = () => {
  const fromEnv = process.env.NETEASE_ANONYMOUS_TOKEN
  if (fromEnv) return fromEnv.trim()

  const fromFile = safeReadFile(
    legacyTmpPath ? path.resolve(legacyTmpPath, 'anonymous_token') : '',
  )
  return fromFile ? fromFile.trim() : ''
}

/**
 * 读取 xeapi_public_key 的可选种子（环境变量优先，其次旧 /tmp 文件）。
 * @returns {Record<string, any> | null}
 */
const readXeapiPublicKeySeed = () => {
  const fromEnv = process.env.NETEASE_XEAPI_PUBLIC_KEY
  const raw =
    fromEnv ||
    safeReadFile(
      legacyTmpPath ? path.resolve(legacyTmpPath, 'xeapi_public_key') : '',
    )
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch (_) {
    return null
  }
}

/**
 * 获取当前 anonymous_token（纯内存，不触发任何 I/O）。
 * @returns {string}
 */
const getAnonymousToken = () => anonymousToken

/**
 * 写入 anonymous_token。
 * @param {string} token
 */
const setAnonymousToken = (token) => {
  if (typeof token === 'string' && token) {
    anonymousToken = token
  }
}

/**
 * 确保 anonymous_token 可用：优先返回内存值，缺失时刷新一次。
 * 并发调用会共享同一个刷新任务，避免重复请求。
 * @param {() => Promise<string>} refresh 刷新函数，返回新的 token
 * @returns {Promise<string>}
 */
const ensureAnonymousToken = async (refresh) => {
  const cached = getAnonymousToken()
  if (cached) return cached
  if (typeof refresh !== 'function') return cached

  if (!anonymousTokenTask) {
    anonymousTokenRefreshing = true
    anonymousTokenTask = Promise.resolve()
      .then(refresh)
      .then((token) => {
        setAnonymousToken(token)
        return token || ''
      })
      .finally(() => {
        anonymousTokenTask = null
        anonymousTokenRefreshing = false
      })
  }
  return anonymousTokenTask
}

/**
 * 获取当前 xeapi public key 状态（纯内存，不触发任何 I/O）。
 * @returns {Record<string, any> | null}
 */
const getXeapiPublicKey = () => xeapiPublicKey

/**
 * 写入 xeapi public key 状态。
 * @param {Record<string, any>} publicKey
 */
const setXeapiPublicKey = (publicKey) => {
  if (publicKey && typeof publicKey === 'object') {
    xeapiPublicKey = publicKey
  }
}

/**
 * 合并并写入 xeapi public key，保留旧状态里的 sk（服务端并非每次下发 sk）。
 * @param {Record<string, any>} publicKey
 * @returns {Record<string, any>}
 */
const mergeXeapiPublicKey = (publicKey) => {
  const previous = getXeapiPublicKey() || {}
  const merged = { ...publicKey }
  if (!merged.sk && previous.sk) {
    merged.sk = previous.sk
  }
  xeapiPublicKey = merged
  return merged
}

/**
 * 确保 xeapi public key 可用。
 *
 * 语义：有缓存且未声明 force 时直接复用；否则调用 refresh 刷新，并发去重。
 * “version 是否变化”由调用方判断并通过 options.force 表达。
 *
 * @param {() => Promise<Record<string, any>>} refresh 刷新函数，返回新的 public key 状态
 * @param {{ force?: boolean }} [options]
 * @returns {Promise<Record<string, any> | null>}
 */
const ensureXeapiPublicKey = async (refresh, options = {}) => {
  const cached = getXeapiPublicKey()
  if (cached && !options.force) {
    return cached
  }
  if (typeof refresh !== 'function') {
    return cached
  }

  if (!xeapiPublicKeyTask) {
    xeapiPublicKeyRefreshing = true
    xeapiPublicKeyTask = Promise.resolve()
      .then(refresh)
      .then((result) => mergeXeapiPublicKey(result || {}))
      .finally(() => {
        xeapiPublicKeyTask = null
        xeapiPublicKeyRefreshing = false
      })
  }
  return xeapiPublicKeyTask
}

/**
 * 刷新类请求是否正在进行中。request 层据此跳过“缺失即刷新”，避免死锁。
 * @returns {boolean}
 */
const isRefreshing = () => anonymousTokenRefreshing || xeapiPublicKeyRefreshing

/**
 * 匿名 token 刷新是否进行中。
 * @returns {boolean}
 */
const isAnonymousTokenRefreshing = () => anonymousTokenRefreshing

/**
 * xeapi public key 刷新是否进行中。
 * @returns {boolean}
 */
const isXeapiPublicKeyRefreshing = () => xeapiPublicKeyRefreshing

/**
 * 清空内存状态。仅用于测试，或需要强制重新初始化的场景。
 */
const reset = () => {
  anonymousToken = ''
  xeapiPublicKey = null
  anonymousTokenTask = null
  xeapiPublicKeyTask = null
  anonymousTokenRefreshing = false
  xeapiPublicKeyRefreshing = false
}

/**
 * 从环境变量 / 旧 /tmp 文件加载可选种子到内存。
 * 默认不启用——由 app/generateConfig 等启动路径显式调用；
 * 测试与只读 FS 场景可以不调用，从而完全避免文件 I/O。
 *
 * @returns {{ anonymousToken: string, xeapiPublicKey: Record<string, any> | null }}
 */
const loadSeed = () => {
  const token = readAnonymousTokenSeed()
  if (token && !anonymousToken) {
    anonymousToken = token
  }
  const publicKey = readXeapiPublicKeySeed()
  if (publicKey && !xeapiPublicKey) {
    xeapiPublicKey = publicKey
  }
  return { anonymousToken, xeapiPublicKey }
}

module.exports = {
  getAnonymousToken,
  setAnonymousToken,
  ensureAnonymousToken,
  getXeapiPublicKey,
  setXeapiPublicKey,
  mergeXeapiPublicKey,
  ensureXeapiPublicKey,
  isRefreshing,
  isAnonymousTokenRefreshing,
  isXeapiPublicKeyRefreshing,
  loadSeed,
  reset,
  // 供 generateConfig 等迁移逻辑按需加载种子
  readAnonymousTokenSeed,
  readXeapiPublicKeySeed,
}

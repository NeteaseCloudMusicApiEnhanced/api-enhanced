/**
 * 凭证刷新层：把“如何获取”与“状态存放”解耦。
 *
 * - util/runtimeState.js 负责进程内状态的存取（纯内存、并发去重）；
 * - 本模块负责实际的网络获取，并在成功后写入 runtimeState。
 *
 * 两者分离后，runtimeState 可被纯单测覆盖（注入 mock 刷新函数），
 * 而本模块是唯一允许 util -> module 依赖的地方。
 */

const runtimeState = require('./runtimeState')
const registerXeapiKey = require('../module/register_xeapikey')
const { cookieToJson } = require('./index')

// 惰性加载 request，规避 util/request -> credentials -> request 的启动期循环依赖。
// runtimeState 与本模块均不在 require 阶段触发网络或文件 I/O。
let requestModule = null
const loadRequest = () => {
  if (!requestModule) {
    requestModule = require('./request')
  }
  return requestModule
}

/**
 * 通过网络注册匿名账号，获取并写入 anonymous_token。
 * @returns {Promise<string>} 最新 token
 */
const refreshAnonymousToken = async () => {
  const { register_anonimous } = require('../module/register_anonimous')
  const res = await register_anonimous({}, loadRequest())
  const cookie = res && res.body ? res.body.cookie : ''
  if (!cookie) {
    throw new Error('anonymous token response missing cookie')
  }
  const cookieObj = cookieToJson(cookie)
  const token = cookieObj.MUSIC_A
  if (!token) {
    throw new Error('anonymous token response missing MUSIC_A')
  }
  runtimeState.setAnonymousToken(token)
  return token
}

/**
 * 获取 xeapi public key（纯获取，不写状态——由 runtimeState 统一合并/写入）。
 *
 * 兼容 serverless：内存缺失时由调用方触发；若服务端未下发 version，
 * 沿用旧状态里的 version，避免无谓的重取判定。
 *
 * @returns {Promise<Record<string, any>>}
 */
const fetchXeapiPublicKey = async () => {
  const current = runtimeState.getXeapiPublicKey() || {}
  const result = await registerXeapiKey(
    {
      deviceId: global.deviceId,
      currentKeyVersion: current.version || '',
    },
    null,
  )
  const publicKey = result && result.body ? result.body : {}
  if (!publicKey.sk && !current.sk) {
    throw new Error('xeapi public key response missing sk')
  }
  if (!publicKey.version && current.version) {
    publicKey.version = current.version
  }
  return publicKey
}

/**
 * 确保 anonymous_token 可用（缺失时刷新）。
 * @returns {Promise<string>}
 */
const ensureAnonymousToken = () =>
  runtimeState.ensureAnonymousToken(refreshAnonymousToken)

/**
 * 确保 xeapi public key 可用。
 *
 * @param {{ force?: boolean }} [options]
 * @returns {Promise<Record<string, any> | null>}
 */
const ensureXeapiPublicKey = (options = {}) =>
  runtimeState.ensureXeapiPublicKey(fetchXeapiPublicKey, options)

module.exports = {
  refreshAnonymousToken,
  fetchXeapiPublicKey,
  ensureAnonymousToken,
  ensureXeapiPublicKey,
}

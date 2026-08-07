// 易盾反作弊 Token 注册端点
// 通过易盾官方 Watchman SDK（Web 版，跑在 jsdom 模拟的浏览器环境里）
// 实时调用 getToken(businessId) 获取反作弊 token，供后续带 checkToken 的请求使用
//
// GET  /register/checktoken/v2        → 实时获取新 token（不缓存）
// POST /register/checktoken/v2        → 实时获取新 token
//
// 注意：每次获取都不缓存，模拟真实客户端每次请求使用新鲜 token，
// 避免反作弊 token 复用触发风控。
//
const { default: axios } = require('axios')
const { APP_CONF } = require('../util/config.json')
const logger = require('../util/logger')

// 网易云音乐在易盾的 productNumber 与 businessId
const PRODUCT_NUMBER = 'YD00000558929251'
const BUSINESS_ID = 'bd5d2f973ef74cd2a61325a412ae54d9'
const TOOL_JS_URL = `${APP_CONF.dunStaticDomain}/tool.min.js`

// 最小 HTML 外壳，模拟网页环境
const HTML =
  '<!doctype html><html><head><meta charset="UTF-8"></head><body></body></html>'

let toolJs = ''
let wm = null // Watchman 实例（进程内复用，可反复 getToken）
let initPromise = null
let jsdomModulePromise = null

// jsdom 的依赖链包含纯 ESM 包（@exodus/bytes），旧版 Node 无法 require() ESM，
function getJSDOM() {
  if (!jsdomModulePromise) {
    jsdomModulePromise = import('jsdom')
  }
  return jsdomModulePromise
}

// 获取 tool.min.js（内存缓存，避免每次初始化重复下载）
async function getToolJs() {
  if (toolJs) return toolJs
  const res = await axios.get(TOOL_JS_URL, { timeout: 10000 })
  toolJs = String(res.data)
  return toolJs
}

// 初始化 Watchman（进程内只初始化一次，实例可反复 getToken）
async function ensureWatchman() {
  if (wm) return wm
  if (initPromise) return initPromise

  initPromise = (async () => {
    const js = await getToolJs()
    const { JSDOM, VirtualConsole } = await getJSDOM()
    const virtualConsole = new VirtualConsole()
    virtualConsole.on('jsdomError', () => {})
    const dom = new JSDOM(HTML, {
      url: 'https://music.163.com/',
      referrer: 'https://music.163.com/',
      contentType: 'text/html',
      runScripts: 'dangerously',
      resources: 'usable', // 允许动态加载 watchman.min.js / JSONP
      pretendToBeVisual: true,
      virtualConsole,
      beforeParse(window) {
        // 抹掉 headless 特征，避免易盾风控误判
        Object.defineProperty(window.navigator, 'webdriver', {
          get: () => undefined,
        })
        window.chrome = { runtime: {} }
        window.navigator.languages = ['zh-CN', 'zh']
        window.navigator.plugins = [1, 2, 3, 4, 5]
      },
    })
    const script = dom.window.document.createElement('script')
    script.textContent = js
    dom.window.document.body.appendChild(script)

    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('watchman 初始化超时')),
        15000,
      )
      dom.window.initWatchman({
        auto: true,
        productNumber: PRODUCT_NUMBER,
        onload(instance) {
          clearTimeout(timer)
          wm = instance
          resolve(instance)
        },
        onerror(...args) {
          clearTimeout(timer)
          reject(new Error('watchman 初始化失败'))
        },
      })
    })
  })()

  try {
    return await initPromise
  } catch (e) {
    initPromise = null
    wm = null
    throw e
  }
}

// 获取新 token
async function fetchToken() {
  const instance = await ensureWatchman()
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(''), 15000)
    instance.getToken(BUSINESS_ID, (tk) => {
      clearTimeout(timer)
      resolve(typeof tk === 'string' ? tk : '')
    })
  })
}

// 端点处理：每次实时获取新 token
module.exports = async () => {
  let token = ''
  try {
    token = await fetchToken()
  } catch (e) {
    logger.warn('[checkToken v2]', e.message)
  }
  return {
    status: 200,
    body: { code: 200, token, registered: !!token },
  }
}

// 给 request.js 读取用：每次调用实时获取新 token，不缓存
module.exports.getToken = async () => {
  try {
    return await fetchToken()
  } catch (e) {
    logger.warn('[checkToken v2]', e.message)
    return ''
  }
}

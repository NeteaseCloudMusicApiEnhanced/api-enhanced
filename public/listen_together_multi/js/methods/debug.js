/**
 * 调试日志：HTTP / IM 结构化记录、JSON 查看器懒加载、调试开关。
 * 默认关闭，开启后才采集；所有结构化数据会先脱敏。
 */
;(function () {
  'use strict'

  const { log } = window.LT

  const REDACT_KEYS =
    /^(cookie|set-cookie|authorization|token|music_u|__csrf|csrf|accid)$/i
  const MAX_DEPTH = 10
  const MAX_ARRAY = 200
  const MAX_KEYS = 200

  function sanitize(value, depth = 0, seen = new WeakSet()) {
    if (value === null || value === undefined) return value
    if (typeof value !== 'object') return value
    if (value instanceof Date) return value.toISOString()
    if (value instanceof Error)
      return { name: value.name, message: value.message, stack: value.stack }
    if (value instanceof FormData) return '[FormData]'
    if (value instanceof Blob) return '[Blob]'
    if (depth >= MAX_DEPTH) return '[Max depth]'
    if (seen.has(value)) return '[Circular]'
    seen.add(value)
    if (Array.isArray(value)) {
      return value
        .slice(0, MAX_ARRAY)
        .map((item) => sanitize(item, depth + 1, seen))
    }
    const result = {}
    for (const key of Object.keys(value).slice(0, MAX_KEYS)) {
      result[key] = REDACT_KEYS.test(key)
        ? '***'
        : sanitize(value[key], depth + 1, seen)
    }
    return result
  }

  let jsonPromise = null

  function ensureJsonFormatter() {
    if (window.JSONFormatter) return Promise.resolve(window.JSONFormatter)
    if (jsonPromise) return jsonPromise
    const version = window.LT.ASSET_VERSION || ''
    jsonPromise = new Promise((resolve, reject) => {
      // UMD 包自带主题样式，无需额外 CSS 请求
      const script = document.createElement('script')
      script.src =
        '/listen_together_multi/vendor/json-formatter.umd.js?v=' + version
      script.async = true
      script.onload = () => {
        if (window.JSONFormatter) resolve(window.JSONFormatter)
        else reject(new Error('JSONFormatter 未初始化'))
      }
      script.onerror = () => reject(new Error('JSONFormatter 加载失败'))
      document.head.appendChild(script)
    }).catch((error) => {
      jsonPromise = null
      throw error
    })
    return jsonPromise
  }

  const debugMethods = {
    toggleDebugCapture() {
      this.debugCapture = !this.debugCapture
      log(
        'info',
        'Debug',
        this.debugCapture
          ? '调试日志已开启（HTTP / IM 结构化记录）'
          : '调试日志已关闭',
      )
    },

    toggleLogPayload(entry) {
      if (!entry || !entry.payload) return
      entry.payloadOpen = !entry.payloadOpen
    },

    ensureJsonFormatter() {
      return ensureJsonFormatter()
    },
  }

  function debugLog(module, msg, payload, level = 'debug') {
    const vm = window.LT.vm
    if (!vm || !vm.debugCapture) return false
    const safe = sanitize(payload)
    if (safe === undefined) {
      log(level, module, msg)
      return true
    }
    log(level, module, msg, '', safe)
    return true
  }

  window.LT.debugMethods = debugMethods
  window.LT.debugLog = debugLog
  window.LT.ensureJsonFormatter = ensureJsonFormatter
  window.LT.sanitizeDebugPayload = sanitize
})()

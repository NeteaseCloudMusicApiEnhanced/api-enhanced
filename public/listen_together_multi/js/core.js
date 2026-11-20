(function () {
'use strict'
window.LT = window.LT || {}
const logs = (window.LT.logs = window.LT.logs || [])
const logData = (data) => {
  if (data === undefined || data === null) return ''
  if (typeof data === 'string') return data.slice(0, 2000)
  try {
    return JSON.stringify(data).slice(0, 2000)
  } catch (e) {
    return String(data).slice(0, 2000)
  }
}
const log = (tag, msg, data = '') => {
  console.log(
    `[${new Date().toLocaleTimeString()}] [${tag}] ${msg}`,
    data,
  )
  const entry = {
    time: Date.now(),
    tag: String(tag || 'log'),
    msg: String(msg || ''),
    data: logData(data),
  }
  logs.push(entry)
  if (logs.length > 300) logs.splice(0, logs.length - 300)
  if (typeof CustomEvent !== 'undefined')
    window.dispatchEvent(new CustomEvent('lt-log', { detail: entry }))
}

const HEARTBEAT_INTERVAL = 5000

const STATUS_INTERVAL = 30000

const MATCH_POLL_INTERVAL = 2000

const CHAT_INTERVAL = 5000

const TICK_INTERVAL = 1000

const REQ_TIMEOUT = 8000

const CHAT_PAGE_SIZE = 100

const api = axios.create({ timeout: REQ_TIMEOUT })

api.interceptors.request.use((config) => {
        // 让服务端把 body 中的伪装字段与请求头里的完整 Cookie 合并：
        // HttpOnly 的 MUSIC_U 等条目从请求头补齐，同名条目以 body 为准。
        if (
          config.data &&
          typeof config.data === 'object' &&
          Object.prototype.hasOwnProperty.call(config.data, 'cookie')
        ) {
          config.data.mergeCookie = 'body'
        }
        if (config.cacheable) {
          delete config.cacheable
          return config
        }
        config.params = Object.assign({}, config.params, {
          timestamp: Date.now(),
        })
        config.headers = Object.assign({}, config.headers, {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          Pragma: 'no-cache',
          Expires: '0',
        })
        return config
      })

const safeStorage = {
        get(key) {
          try {
            return localStorage.getItem(key) || ''
          } catch (e) {
            log('Storage', '读取被阻止', e.message)
            return ''
          }
        },
        set(key, val) {
          try {
            localStorage.setItem(key, String(val))
            return true
          } catch (e) {
            log('Storage', '写入被阻止', e.message)
            return false
          }
        },
      }

const AUDIO_LEVELS = [
        { key: 'standard', label: '标准 128k' },
        { key: 'higher', label: '较高 192k' },
        { key: 'exhigh', label: '极高 320k' },
        { key: 'lossless', label: '无损 FLAC' },
        { key: 'hires', label: 'Hi-Res' },
      ]

const DEFAULT_AUDIO_LEVEL = 'higher'


window.LT = Object.assign(window.LT, { log, HEARTBEAT_INTERVAL, STATUS_INTERVAL, MATCH_POLL_INTERVAL, CHAT_INTERVAL, TICK_INTERVAL, REQ_TIMEOUT, CHAT_PAGE_SIZE, api, safeStorage, AUDIO_LEVELS, DEFAULT_AUDIO_LEVEL })
})()

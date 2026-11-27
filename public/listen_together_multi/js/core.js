/**
 * 运行时基础：axios 实例、日志、本地存储、常量与通用工具
 */
;(function () {
  'use strict'

  window.LT = window.LT || {}
  const LT = window.LT

  /* ---------------- 日志 ---------------- */

  const logs = (LT.logs = LT.logs || [])

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
    console.log(`[${new Date().toLocaleTimeString()}] [${tag}] ${msg}`, data)
    const entry = {
      time: Date.now(),
      tag: String(tag || 'log'),
      msg: String(msg || ''),
      data: logData(data),
    }
    logs.push(entry)
    if (logs.length > 300) logs.splice(0, logs.length - 300)
    if (typeof CustomEvent !== 'undefined') {
      window.dispatchEvent(new CustomEvent('lt-log', { detail: entry }))
    }
  }

  /* ---------------- 时间常量 ---------------- */

  const HEARTBEAT_INTERVAL = 5000
  const STATUS_INTERVAL = 30000
  const MATCH_POLL_INTERVAL = 2000
  const CHAT_INTERVAL = 5000
  const TICK_INTERVAL = 1000
  const REQ_TIMEOUT = 8000
  const CHAT_PAGE_SIZE = 100
  const CHAT_MAX_LENGTH = 100

  /* ---------------- 请求实例 ---------------- */

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

  /* ---------------- 存储 ---------------- */

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
    remove(key) {
      try {
        localStorage.removeItem(key)
      } catch (e) {
        /* ignore */
      }
    },
    json(key, fallback) {
      try {
        const raw = localStorage.getItem(key)
        if (!raw) return fallback
        const parsed = JSON.parse(raw)
        return parsed === null || parsed === undefined ? fallback : parsed
      } catch (e) {
        return fallback
      }
    },
  }

  /* ---------------- 音质 ---------------- */

  const AUDIO_LEVELS = [
    { key: 'standard', label: '标准 128k' },
    { key: 'higher', label: '较高 192k' },
    { key: 'exhigh', label: '极高 320k' },
    { key: 'lossless', label: '无损 FLAC' },
    { key: 'hires', label: 'Hi-Res' },
  ]

  const DEFAULT_AUDIO_LEVEL = 'higher'

  /* ---------------- 通用工具 ---------------- */

  const util = {
    escapeHtml(value) {
      return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
    },
    // 昵称首字：中文取首字，英文取首字母
    initialOf(name) {
      const text = String(name == null ? '' : name).trim()
      if (!text) return '?'
      const char = Array.from(text)[0]
      return /[a-z]/i.test(char) ? char.toUpperCase() : char
    },
    pad2(value) {
      return String(Math.floor(Number(value) || 0)).padStart(2, '0')
    },
    formatClock(seconds) {
      const total = Math.max(0, Math.floor(Number(seconds) || 0))
      return `${util.pad2(total / 60)}:${util.pad2(total % 60)}`
    },
    formatRelativeTime(timestamp) {
      const time = Number(timestamp) || 0
      if (!time) return ''
      const normalized = time < 1e12 ? time * 1000 : time
      const diff = Date.now() - normalized
      if (diff < 0) return '刚刚'
      const minute = 60000
      const hour = 3600000
      const day = 86400000
      if (diff < minute) return '刚刚'
      if (diff < hour) return `${Math.floor(diff / minute)} 分钟前`
      if (diff < day) return `${Math.floor(diff / hour)} 小时前`
      if (diff < day * 7) return `${Math.floor(diff / day)} 天前`
      const date = new Date(normalized)
      return `${date.getMonth() + 1}/${date.getDate()}`
    },
    dayLabel(timestamp) {
      const time = Number(timestamp) || 0
      if (!time) return ''
      const normalized = time < 1e12 ? time * 1000 : time
      const date = new Date(normalized)
      const now = new Date()
      const sameDay =
        date.getFullYear() === now.getFullYear() &&
        date.getMonth() === now.getMonth() &&
        date.getDate() === now.getDate()
      if (sameDay) return '今天'
      const yesterday = new Date(now)
      yesterday.setDate(now.getDate() - 1)
      if (
        date.getFullYear() === yesterday.getFullYear() &&
        date.getMonth() === yesterday.getMonth() &&
        date.getDate() === yesterday.getDate()
      ) {
        return '昨天'
      }
      return `${date.getMonth() + 1} 月 ${date.getDate()} 日`
    },
    clamp(value, min, max) {
      return Math.min(Math.max(Number(value) || 0, min), max)
    },
    uidOf(user) {
      if (!user) return ''
      return user.uid ?? user.userId ?? user.userID ?? user.id ?? ''
    },
    // NIM 文本偶尔以 latin1 形式到达（UTF-8 字节被逐字节解码），尝试还原。
    // 用 fatal 解码：只有严格合法的 UTF-8 才替换，避免把正常文本改坏。
    fixMojibake(text) {
      const value = String(text == null ? '' : text)
      if (!value) return value
      if (/[\u4e00-\u9fff]/.test(value)) return value
      if (!/[\u00a0-\u00ff]{2,}/.test(value)) return value
      try {
        const bytes = Uint8Array.from(
          value,
          (char) => char.charCodeAt(0) & 0xff,
        )
        const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
        if (/[\u4e00-\u9fff]/.test(decoded)) return decoded
      } catch (e) {
        /* 不是合法的 UTF-8 字节序列，保持原样 */
      }
      return value
    },
    // 网易云图片 CDN 支持 param=WxH，按展示尺寸取图，避免整张原图
    imageUrl(url, size = 0) {
      const raw = String(url == null ? '' : url).trim()
      if (!raw) return ''
      if (!/^https?:\/\//i.test(raw)) return raw
      const host = (raw.match(/^https?:\/\/([^/]+)/i) || [])[1] || ''
      if (!/(^|\.)music\.126\.net$/i.test(host)) return raw
      const secure = raw.replace(/^http:\/\//i, 'https://')
      if (!size) {
        const sep0 = secure.includes('?') ? '&' : '?'
        return `${secure}${sep0}param=original`
      }
      const value = Math.max(32, Math.round(Number(size) || 0))
      const sep = secure.includes('?') ? '&' : '?'
      if (/[?&]param=/i.test(secure)) return secure
      return `${secure}${sep}param=${value}y${value}`
    },
  }

  /* ---------------- 静态表情 / 颜文字 ---------------- */

  const unicodeEmojis = [
    '😀',
    '😄',
    '😁',
    '😂',
    '🥹',
    '😊',
    '😍',
    '🥰',
    '😘',
    '😎',
    '🥳',
    '🤩',
    '🤔',
    '🫡',
    '🥲',
    '😭',
    '😮',
    '😴',
    '🙃',
    '🤗',
    '👍',
    '👏',
    '🙌',
    '🤝',
    '🫶',
    '❤️',
    '💖',
    '💔',
    '🔥',
    '✨',
    '🎵',
    '🎶',
    '🎧',
    '🎤',
    '🎸',
    '🎹',
    '🥁',
    '🌙',
    '☀️',
    '🌈',
    '🌸',
    '🍀',
    '☕',
    '🍻',
    '🎉',
    '💯',
    '✅',
    '👀',
  ]

  const kaomojiList = [
    '(＾▽＾)',
    '(๑•̀ㅂ•́)و✧',
    '(´･ω･`)',
    '(≧▽≦)',
    '(￣▽￣)',
    '(T_T)',
    '(>_<)',
    '(｡･ω･｡)',
    '(╯°□°）╯',
    '┐(´д`)┌',
    '(・ω・)ノ',
    '(￣ε￣)',
    '(づ｡◕‿‿◕｡)づ',
    '( ͡° ͜ʖ ͡°)',
    'ヾ(≧▽≦*)o',
  ]

  Object.assign(LT, {
    log,
    logs,
    HEARTBEAT_INTERVAL,
    STATUS_INTERVAL,
    MATCH_POLL_INTERVAL,
    CHAT_INTERVAL,
    TICK_INTERVAL,
    REQ_TIMEOUT,
    CHAT_PAGE_SIZE,
    CHAT_MAX_LENGTH,
    api,
    safeStorage,
    AUDIO_LEVELS,
    DEFAULT_AUDIO_LEVEL,
    util,
    unicodeEmojis,
    kaomojiList,
  })
})()

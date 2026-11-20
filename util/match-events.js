// Per-account bridge between the mini NIM matching notifications and SSE.
// The HTTP match endpoint only puts the account into the pool; the official
// client completes the match after receiving STRANGER_MULTI_MATCH_WAIT_ACK.
const crypto = require('crypto')
const { MiniNim } = require('./mini-nim')

const sessions = new Map()

function parse(value) {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function parseMatch(content) {
  const envelope = parse(content)
  if (
    !envelope ||
    ![132, 133].includes(envelope.msgType) ||
    envelope.bizType !== 'music_listenTogether_multi_match_song'
  )
    return null
  const event = parse(envelope.serverExt)
  const data = parse(event && event.data)
  if (!event || !data) return null
  if (
    event.subType === 'STRANGER_MULTI_MATCH_WAIT_ACK' &&
    typeof data.roomId === 'string' &&
    /^[\w-]{1,128}$/.test(data.roomId)
  )
    return { type: 'ready', roomId: data.roomId }
  if (event.subType === 'STRANGER_MULTI_MATCH_FAILED')
    return {
      type: 'failed',
      reason:
        typeof data.failedType === 'string'
          ? data.failedType.slice(0, 100)
          : 'MATCH_FAILED',
    }
  return null
}

function cookieKey(cookie) {
  return crypto
    .createHash('sha256')
    .update(cookie.MUSIC_U || JSON.stringify(cookie))
    .digest('hex')
}

function broadcast(session, event) {
  for (const send of [...session.subs]) {
    try {
      send(event)
    } catch (error) {
      session.subs.delete(send)
    }
  }
}

async function tokenFor(cookie) {
  const request = require('./request')
  const result = await request(
    '/api/middle/im/token/get',
    { bizTag: 'platform' },
    { crypto: 'eapi', cookie },
  )
  const data = result && result.body && result.body.data
  if (
    !result ||
    result.body.code !== 200 ||
    !data ||
    typeof data.accId !== 'string' ||
    !data.accId ||
    typeof data.token !== 'string' ||
    !data.token
  )
    throw new Error(
      (result && result.body && (result.body.message || result.body.msg)) ||
        '未取得 mini NIM 凭据',
    )
  return data
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function connectMini(session, key, cookie) {
  let lastError = new Error('连接 mini NIM 超时，请重试')
  for (let attempt = 0; attempt < 3; attempt++) {
    if (session.closed) throw new Error('匹配通知连接已关闭')
    let mini = null
    let starting = true
    try {
      const data = await tokenFor(cookie)
      mini = new MiniNim({ timeoutMs: 20000 })
      session.client = mini
      mini.on('notice', ({ timestamp, content }) => {
        const event = parseMatch(content)
        if (event) broadcast(session, { ...event, timestamp })
      })
      mini.on('closed', (reason) => {
        if (starting || session.closed) return
        session.closed = true
        broadcast(session, { type: 'closed', reason })
        sessions.delete(key)
      })
      await mini.start({ accId: data.accId, token: data.token })
      starting = false
      if (mini.ended) throw new Error('mini NIM 连接已断开')
      return mini
    } catch (error) {
      starting = false
      lastError = error instanceof Error ? error : new Error(String(error))
      if (mini) {
        mini.removeAllListeners('closed')
        try {
          mini.close('mini NIM 重试')
        } catch (e) {}
      }
      session.client = null
      if (session.closed) throw new Error('匹配通知连接已关闭')
      if (attempt < 2) await sleep(800 * (attempt + 1))
    }
  }
  throw lastError
}

function ensureSession(key, session, cookie) {
  if (!session.ready) {
    session.ready = (async () => {
      await connectMini(session, key, cookie)
    })().catch((error) => {
      session.closed = true
      sessions.delete(key)
      throw error
    })
  }
  return session.ready
}

/**
 * Subscribe to matching notifications for the cookie's account.
 * Returns an unsubscribe function after the mini NIM login succeeds.
 */
async function subscribe(cookie, send) {
  const key = cookieKey(cookie)
  let session = sessions.get(key)
  if (!session || session.closed) {
    session = { subs: new Set(), client: null, ready: null, closed: false }
    sessions.set(key, session)
  }
  session.subs.add(send)
  try {
    await ensureSession(key, session, cookie)
    if (session.closed) throw new Error('匹配通知连接已关闭')
    // A late subscriber (for example after a page refresh) reused this
    // session, so tell it explicitly that the mini NIM connection is ready.
    send({ type: 'connected' })
  } catch (error) {
    session.subs.delete(send)
    throw error
  }
  return () => {
    session.subs.delete(send)
    if (session.subs.size) return
    setTimeout(() => {
      if (session.subs.size || session.closed) return
      session.closed = true
      session.client && session.client.close()
      sessions.delete(key)
    }, 15000).unref()
  }
}

module.exports = { subscribe, parseMatch }

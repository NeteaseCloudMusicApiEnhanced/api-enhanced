// 解析网易云分享链接（含 163cn.tv 短链接）里的房间/歌曲参数
// 只允许网易云相关域名，避免把服务端当通用 SSRF 代理。
const axios = require('axios')

const ALLOWED_HOSTS = new Set([
  '163cn.tv',
  'www.163cn.tv',
  'music.163.com',
  'www.music.163.com',
  'st.music.163.com',
  'y.music.163.com',
  'm.music.163.com',
])

function normalize(value) {
  const text = String(value || '').trim()
  if (!text) throw new Error('请输入分享链接')
  const match = text.match(/https?:\/\/[^\s]+/i)
  const link = match ? match[0] : text
  const withScheme = /^https?:\/\//i.test(link) ? link : `https://${link}`
  let url
  try {
    url = new URL(withScheme)
  } catch (e) {
    throw new Error('分享链接格式无效')
  }
  if (
    !ALLOWED_HOSTS.has(url.hostname) ||
    url.username ||
    url.password ||
    url.port
  )
    throw new Error('仅支持网易云分享链接')
  return url
}

function parseFields(url) {
  const query = new URLSearchParams(url.search)
  const hashQuery = url.hash.includes('?')
    ? new URLSearchParams(url.hash.slice(url.hash.indexOf('?') + 1))
    : new URLSearchParams()
  const value = (key) => query.get(key) || hashQuery.get(key) || ''
  const roomId = value('roomId')
  const inviterUid = value('inviterUid') || value('inviterId')
  const songId = value('id') || value('songId')
  return {
    url: url.href,
    roomId: /^[\w-]{1,128}$/.test(roomId) ? roomId : '',
    inviterUid: /^\d{1,24}$/.test(inviterUid) ? inviterUid : '',
    songId: /^\d{1,24}$/.test(songId) ? songId : '',
  }
}

async function resolveShare(url) {
  let current = normalize(url)
  for (let hop = 0; hop < 6; hop++) {
    const response = await axios.get(current.href, {
      maxRedirects: 0,
      timeout: 10000,
      validateStatus: (status) => status >= 200 && status < 400,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
      },
    })
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.location
      if (!location) break
      const next = normalize(new URL(location, current.href))
      current = next
      continue
    }
    const body = typeof response.data === 'string' ? response.data : ''
    const target = body.match(
      /https?:\/\/[^\s"'<>]+(?:roomId|multishare)[^\s"'<>]*/i,
    )
    if (target) {
      try {
        const next = normalize(target[0].replace(/&amp;/g, '&'))
        if (next.href !== current.href) {
          current = next
          continue
        }
      } catch (e) {}
    }
    break
  }
  return parseFields(current)
}

module.exports = async (query) => {
  try {
    const result = await resolveShare(query.url)
    return { status: 200, body: { code: 200, data: result } }
  } catch (error) {
    return {
      status: 400,
      body: { code: 400, message: error.message || '分享链接解析失败' },
    }
  }
}

module.exports.parseFields = parseFields
module.exports.normalize = normalize

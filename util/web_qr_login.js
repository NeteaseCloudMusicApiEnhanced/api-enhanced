const crypto = require('crypto')
const createOption = require('./option.js')
const { cookieObjToString, cookieToJson } = require('./index')

const WEB_QR_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:152.0) Gecko/20100101 Firefox/152.0'

const randomFrom = (alphabet, length) => {
  let value = ''
  for (let i = 0; i < length; i++) {
    value += alphabet[crypto.randomInt(0, alphabet.length)]
  }
  return value
}

const randomHex = (bytes) => crypto.randomBytes(bytes).toString('hex')

const randomWebToken = (length) =>
  randomFrom(
    '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-_',
    length,
  )

const normalizeCookie = (cookie) => {
  if (!cookie) return {}
  return typeof cookie === 'string' ? cookieToJson(cookie) : cookie
}

const createWebQrCookie = (cookie) => {
  const current = normalizeCookie(cookie)
  const nuid = current._ntes_nuid || randomHex(16)
  return {
    ...current,
    'JSESSIONID-WYYY': current['JSESSIONID-WYYY'] || randomWebToken(190),
    _iuqxldmzr_: current._iuqxldmzr_ || '33',
    _ntes_nnid: current._ntes_nnid || `${nuid},${Date.now()}`,
    _ntes_nuid: nuid,
    NMTID: current.NMTID || `00${randomWebToken(39)}`,
    WEVNSM: current.WEVNSM || '1.0.0',
    WNMCID:
      current.WNMCID ||
      `${randomFrom('abcdefghijklmnopqrstuvwxyz', 6)}.${Date.now()}.01.0`,
  }
}

const cookieToSetCookieList = (cookie) =>
  Object.keys(cookie).map((key) => `${key}=${cookie[key]}`)

const mergeCookieLists = (base = [], extra = []) => {
  const merged = new Map()
  const add = (cookie) => {
    const value = String(cookie || '').split(';')[0]
    const index = value.indexOf('=')
    if (index <= 0) return
    merged.set(value.slice(0, index), value)
  }

  base.forEach(add)
  extra.forEach(add)
  return [...merged.values()]
}

const createWebQrOption = (query = {}, headers = {}) => {
  const option = createOption(query, 'weapi')
  const cookie = createWebQrCookie(option.cookie)

  option.cookie = cookie
  option.rawCookie = cookieObjToString(cookie)
  option.skipCookieProcessing = true
  option.ua = query.ua || WEB_QR_USER_AGENT
  option.headers = {
    ...option.headers,
    Referer: 'https://music.163.com/',
    Origin: 'https://music.163.com',
    'x-os': 'web',
    'X-channelSource': 'undefined',
    'Nm-GCore-Status': '1',
    ...headers,
  }
  option.webQrCookieSet = cookieToSetCookieList(cookie)

  return option
}

module.exports = {
  createWebQrOption,
  mergeCookieLists,
}

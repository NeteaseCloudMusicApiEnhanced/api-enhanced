const createOption = require('./option.js')
const { cookieToJson } = require('./index')
const { APP_CONF } = require('./config.json')

const MOBILE_LOGIN_PLATFORMS = new Set(['app', 'ios', 'iphone', 'mobile'])
const IOS_APPVER = '9.5.37'
const IOS_OSVER = '18.7.2'
const IOS_BUILDVER = '7010'
const IOS_USER_AGENT = `neteasemusic/${IOS_APPVER} (iPhone; iOS ${IOS_OSVER}; Scale/3.00)`
const MOBILE_API_DOMAIN =
  APP_CONF.xeapiDomain || 'https://interface3.music.163.com'

const isMobilePlatform = (query = {}) => {
  const platform = String(query.platform || '').toLowerCase()
  return query.mobile === true || MOBILE_LOGIN_PLATFORMS.has(platform)
}

const normalizeCookie = (cookie) => {
  if (!cookie) return {}
  return typeof cookie === 'string' ? cookieToJson(cookie) : cookie
}

const createMobileEapiOption = (query = {}) => {
  const e_r = query.e_r === undefined ? true : query.e_r
  const option = createOption(
    {
      ...query,
      domain: query.domain || MOBILE_API_DOMAIN,
      e_r,
    },
    'eapi',
  )

  option.cookie = {
    ...normalizeCookie(option.cookie),
    os: 'iPhone OS',
    osver: IOS_OSVER,
    appver: IOS_APPVER,
    buildver: IOS_BUILDVER,
    channel: 'distribution',
  }
  option.domain = query.domain || MOBILE_API_DOMAIN
  option.ua = query.ua || IOS_USER_AGENT
  option.e_r = e_r
  option.emptyHeader = true
  option.mobileEapi = true
  option.headers = {
    ...option.headers,
    'content-type': 'application/x-www-form-urlencoded',
    'x-aeapi': 'true',
    'x-os': 'iPhone OS',
    'x-osver': IOS_OSVER,
    'x-appver': IOS_APPVER,
    'x-buildver': IOS_BUILDVER,
  }

  return option
}

module.exports = {
  createMobileEapiOption,
  isMobilePlatform,
}

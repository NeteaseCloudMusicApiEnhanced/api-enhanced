const { getCookieHeader, hasCookie } = require('./index')

const createOption = (query, crypto = '', checkToken = false) => {
  const headerCookie = getCookieHeader(query.headers)

  return {
    crypto: query.crypto || crypto || '',
    cookie: hasCookie(query.cookie)
      ? query.cookie
      : hasCookie(headerCookie)
        ? headerCookie
        : process.env.NETEASE_COOKIE,
    ua: query.ua || '',
    proxy: query.proxy,
    realIP: query.realIP,
    randomCNIP:
      process.env.ENABLE_RANDOM_CN_IP === 'true'
        ? !['false', false].includes(query.randomCNIP)
        : ['true', true].includes(query.randomCNIP),
    e_r: query.e_r || undefined,
    domain: query.domain || '',
    checkToken: query.checkToken || checkToken,
    headers: query.headers || {},
    timeout: query.timeout || 0,
  }
}
module.exports = createOption

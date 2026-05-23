const createOption = (query, crypto = '') => {
  return {
    crypto: query.crypto || crypto || '',
    cookie: query.cookie || process.env.NETEASE_COOKIE,
    ua: query.ua || '',
    proxy: query.proxy,
    realIP: query.realIP,
    randomCNIP: query.randomCNIP || false,
    e_r: query.e_r || undefined,
    domain: query.domain || '',
    checkToken: query.checkToken || false,
    xeapiServerKey:
      query.xeapiServerKey || process.env.XEAPI_SERVER_PUBLIC_KEY || '',
  }
}
module.exports = createOption

// 发送验证码

const createOption = require('../util/option.js')
const {
  createMobileEapiOption,
  isMobilePlatform,
} = require('../util/mobile.js')
module.exports = (query, request) => {
  if (isMobilePlatform(query)) {
    const data = {
      ctcode: query.ctcode || query.countrycode || '86',
      cellphone: query.phone,
      os: 'iOS',
      fromPage: query.fromPage || 'RN',
      rnBundleVersion: query.rnBundleVersion || '0.0.5',
      rnBundleName: query.rnBundleName || 'new-rn-login',
      verifyId: 1,
      e_r: query.e_r === undefined ? true : query.e_r,
    }
    return request(`/api/sms/captcha/sent`, data, createMobileEapiOption(query))
  }

  const data = {
    ctcode: query.ctcode || query.countrycode || '86',
    secrete: 'music_middleuser_pclogin',
    cellphone: query.phone,
  }
  return request(`/api/sms/captcha/sent`, data, createOption(query, 'weapi'))
}

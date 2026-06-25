// 手机登录

const CryptoJS = require('crypto-js')

const createOption = require('../util/option.js')
const {
  createMobileEapiOption,
  isMobilePlatform,
} = require('../util/mobile.js')
module.exports = async (query, request) => {
  const countrycode = query.countrycode || query.ctcode || '86'
  const data = {
    type: '1',
    https: 'true',
    phone: query.phone,
    countrycode,
    [query.captcha ? 'captcha' : 'password']: query.captcha
      ? query.captcha
      : query.md5_password || CryptoJS.MD5(query.password).toString(),
    remember: 'true',
  }
  const mobile = isMobilePlatform(query)

  if (mobile) {
    data.rememberLogin = 'true'
    data.os = 'iOS'
    data.fromPage = query.fromPage || 'RN'
    data.rnBundleVersion = query.rnBundleVersion || '0.0.5'
    data.rnBundleName = query.rnBundleName || 'new-rn-login'
    data.verifyId = 1
    data.e_r = query.e_r === undefined ? true : query.e_r
  }

  let result = await request(
    mobile ? `/api/login/cellphone` : `/api/w/login/cellphone`,
    data,
    mobile ? createMobileEapiOption(query) : createOption(query, 'weapi'),
  )

  if (result.body.code === 200) {
    result = {
      status: 200,
      body: {
        ...JSON.parse(
          JSON.stringify(result.body).replace(
            /avatarImgId_str/g,
            'avatarImgIdStr',
          ),
        ),
        cookie: result.cookie.join(';'),
      },
      cookie: result.cookie,
    }
  }
  return result
}

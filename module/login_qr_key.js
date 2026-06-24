const createOption = require('../util/option.js')
module.exports = async (query, request) => {
  const platform = query.platform || 'web'
  const data = {
    type: 3,
  }
  const option = createOption(query, platform === 'web' ? 'weapi' : '')

  if (platform === 'web') {
    option.headers = {
      ...option.headers,
      Referer: 'https://music.163.com/',
      Origin: 'https://music.163.com',
      'X-OS': 'web',
      'X-ChannelSource': 'undefined',
      'NM-GCORE-STATUS': '1',
    }
  }

  const result = await request(`/api/login/qrcode/unikey`, data, option)
  return {
    status: 200,
    body: {
      data: result.body,
      code: 200,
    },
    cookie: result.cookie,
  }
}

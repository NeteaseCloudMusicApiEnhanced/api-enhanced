// 获取客户端歌曲下载链接 - v1
// 此版本不再采用 br 作为音质区分的标准
// 而是采用 standard, exhigh, lossless, hires, jyeffect(高清环绕声), sky(沉浸环绕声), vivid(臻音全景声), jymaster(超清母带) 进行音质判断

const createOption = require('../util/option.js')
const { cookieToJson } = require('../util/index.js')
module.exports = async (query, request) => {
  const data = {
    id: query.id,
    immerseType: 'c51',
    level: query.level,
  }
  const options = createOption(query)
  if (query.level === 'vivid') {
    const cookie = options.cookie
    options.cookie = {
      ...(typeof cookie === 'string' ? cookieToJson(cookie) : cookie),
      os: 'android',
      appver: '9.5.61',
    }
  }
  const response = await request(
    `/api/song/enhance/download/url/v1`,
    data,
    options,
  )
  let url = response?.body?.data?.url || response?.body?.data?.[0]?.url

  if (!url) {
    const fallbackData = {
      ids: `[${query.id}]`,
      level: query.level,
      encodeType: 'flac',
    }
    if (query.level === 'sky') {
      fallbackData.immerseType = 'c51'
    }
    if (query.level === 'vivid') {
      fallbackData.encodeType = 'mp3'
    }
    const fallback = await request(
      `/api/song/enhance/player/url/v1`,
      fallbackData,
      options,
    )
    url = fallback?.body?.data?.[0]?.url

    if (!url) {
      return fallback
    }

    return {
      status: 302,
      body: '',
      cookie: fallback.cookie || [],
      redirectUrl: url,
    }
  }

  return {
    status: 302,
    body: '',
    cookie: response.cookie || [],
    redirectUrl: url,
  }
}

// 获取广告

const createOption = require('../util/option.js')

module.exports = async (query, request) => {
  const data = {
    type_ids: query.type_ids || '["400002_0"]',
  }

  const option = createOption(query, 'xeapi', 'v3')

  const res = await request(`/api/ad/get`, data, option)
  const raw = res.body

  // 提取广告中的 req_id
  let reqId = ''
  try {
    if (raw?.ads) {
      const ad = Object.values(raw.ads)[0]
      // 逆向 v9.5.61：客户端从 ad.adExtMap["req_id"] 取 reqUid
      if (ad?.adExtMap) {
        if (typeof ad.adExtMap === 'string') {
          try {
            reqId = JSON.parse(ad.adExtMap).req_id || ''
          } catch (_) {}
        } else {
          reqId = ad.adExtMap.req_id || ''
        }
      }
      // 兜底：adLogId.requestId / ad.reqId / extJson.contextInfo.req_id
      if (!reqId && ad?.adLogId?.requestId) reqId = ad.adLogId.requestId
      if (!reqId && ad?.reqId) reqId = ad.reqId
      if (!reqId && ad?.extJson) {
        try {
          const ext = JSON.parse(ad.extJson)
          reqId = ext?.contextInfo?.req_id || ''
        } catch (_) {}
      }
    }
  } catch (_) {}

  return {
    status: 200,
    body: {
      code: 200,
      ads: raw?.ads || null,
      message: raw?.message || null,
      extra: { reqId },
    },
  }
}

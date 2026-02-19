const { default: axios } = require('axios')
const createOption = require('../util/option.js')

module.exports = async (query, request) => {
  const { md5, fileSize, filename, bitrate = 999000 } = query

  if (!md5 || !fileSize || !filename) {
    return Promise.reject({
      status: 400,
      body: {
        code: 400,
        msg: '缺少必要参数: md5, fileSize, filename',
      },
    })
  }

  const ext = filename.includes('.') ? filename.split('.').pop() : 'mp3'

  const checkRes = await request(
    `/api/cloud/upload/check`,
    {
      bitrate: String(bitrate),
      ext: '',
      length: fileSize,
      md5: md5,
      songId: '0',
      version: 1,
    },
    createOption(query),
  )

  const bucket = 'jd-musicrep-privatecloud-audio-public'
  const tokenRes = await request(
    `/api/nos/token/alloc`,
    {
      bucket: bucket,
      ext: ext,
      filename: filename
        .replace(/\.[^.]+$/, '')
        .replace(/\s/g, '')
        .replace(/\./g, '_'),
      local: false,
      nos_product: 3,
      type: 'audio',
      md5: md5,
    },
    createOption(query, 'weapi'),
  )

  if (!tokenRes.body.result || !tokenRes.body.result.objectKey) {
    return Promise.reject({
      status: 500,
      body: {
        code: 500,
        msg: '获取上传token失败',
        detail: tokenRes.body,
      },
    })
  }

  let lbs
  try {
    lbs = (
      await axios({
        method: 'get',
        url: `https://wanproxy.127.net/lbs?version=1.0&bucketname=${bucket}`,
        timeout: 10000,
      })
    ).data
  } catch (error) {
    return Promise.reject({
      status: 500,
      body: {
        code: 500,
        msg: '获取上传服务器地址失败',
        detail: error.message,
      },
    })
  }

  if (!lbs || !lbs.upload || !lbs.upload[0]) {
    return Promise.reject({
      status: 500,
      body: {
        code: 500,
        msg: '获取上传服务器地址无效',
        detail: lbs,
      },
    })
  }

  return {
    status: 200,
    body: {
      code: 200,
      data: {
        needUpload: checkRes.body.needUpload,
        songId: checkRes.body.songId,
        uploadToken: tokenRes.body.result.token,
        objectKey: tokenRes.body.result.objectKey,
        resourceId: tokenRes.body.result.resourceId,
        uploadUrl: `${lbs.upload[0]}/${bucket}/${tokenRes.body.result.objectKey.replace(/\//g, '%2F')}?offset=0&complete=true&version=1.0`,
        bucket: bucket,
        md5: md5,
        fileSize: fileSize,
        filename: filename,
      },
    },
    cookie: checkRes.cookie,
  }
}

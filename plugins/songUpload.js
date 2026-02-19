const { default: axios } = require('axios')
const createOption = require('../util/option.js')
const logger = require('../util/logger.js')
const {
  getUploadData,
  getFileExtension,
  sanitizeFilename,
} = require('../util/fileHelper')

module.exports = async (query, request) => {
  const ext = getFileExtension(query.songFile.name)
  const filename = sanitizeFilename(query.songFile.name)
  const bucket = 'jd-musicrep-privatecloud-audio-public'

  const tokenRes = await request(
    `/api/nos/token/alloc`,
    {
      bucket: bucket,
      ext: ext,
      filename: filename,
      local: false,
      nos_product: 3,
      type: 'audio',
      md5: query.songFile.md5,
    },
    createOption(query, 'weapi'),
  )

  if (!tokenRes.body.result || !tokenRes.body.result.objectKey) {
    logger.error('Token分配失败:', tokenRes.body)
    throw {
      status: 500,
      body: {
        code: 500,
        msg: '获取上传token失败',
        detail: tokenRes.body,
      },
    }
  }

  const objectKey = tokenRes.body.result.objectKey.replace(/\//g, '%2F')
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
    logger.error('LBS获取失败:', error.message)
    throw {
      status: 500,
      body: {
        code: 500,
        msg: '获取上传服务器地址失败',
        detail: error.message,
      },
    }
  }

  if (!lbs || !lbs.upload || !lbs.upload[0]) {
    logger.error('无效的LBS响应:', lbs)
    throw {
      status: 500,
      body: {
        code: 500,
        msg: '获取上传服务器地址无效',
        detail: lbs,
      },
    }
  }

  try {
    await axios({
      method: 'post',
      url: `${lbs.upload[0]}/${bucket}/${objectKey}?offset=0&complete=true&version=1.0`,
      headers: {
        'x-nos-token': tokenRes.body.result.token,
        'Content-MD5': query.songFile.md5,
        'Content-Type': query.songFile.mimetype || 'audio/mpeg',
        'Content-Length': String(query.songFile.size),
      },
      data: getUploadData(query.songFile),
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      timeout: 300000,
    })
    logger.info('上传成功:', filename)
  } catch (error) {
    logger.error('上传失败:', {
      status: error.response?.status,
      data: error.response?.data,
      message: error.message,
    })
    throw {
      status: error.response?.status || 500,
      body: {
        code: error.response?.status || 500,
        msg: '文件上传失败',
        detail: error.response?.data || error.message,
      },
    }
  }
  return {
    ...tokenRes,
  }
}

const uploadPlugin = require('../plugins/songUpload')
const md5 = require('md5')
const createOption = require('../util/option.js')
const logger = require('../util/logger.js')
let mm
module.exports = async (query, request) => {
  mm = require('music-metadata')
  let ext = 'mp3'
  if (query.songFile.name.includes('.')) {
    ext = query.songFile.name.split('.').pop()
  }
  query.songFile.name = Buffer.from(query.songFile.name, 'latin1').toString(
    'utf-8',
  )
  const filename = query.songFile.name
    .replace('.' + ext, '')
    .replace(/\s/g, '')
    .replace(/\./g, '_')
  const bitrate = 999000
  if (!query.songFile) {
    return Promise.reject({
      status: 500,
      body: {
        msg: '请上传音乐文件',
        code: 500,
      },
    })
  }
  if (!query.songFile.md5) {
    query.songFile.md5 = md5(query.songFile.data)
    query.songFile.size = query.songFile.data.byteLength
  }
  const res = await request(
    `/api/cloud/upload/check`,
    {
      bitrate: String(bitrate),
      ext: '',
      length: query.songFile.size,
      md5: query.songFile.md5,
      songId: '0',
      version: 1,
    },
    createOption(query),
  )
  let artist = ''
  let album = ''
  let songName = ''
  try {
    const metadata = await mm.parseBuffer(
      query.songFile.data,
      query.songFile.mimetype,
    )
    const info = metadata.common

    if (info.title) {
      songName = info.title
    }
    if (info.album) {
      album = info.album
    }
    if (info.artist) {
      artist = info.artist
    }
  } catch (error) {
    logger.info('metadata parse error:', error.message)
  }
  const tokenRes = await request(
    `/api/nos/token/alloc`,
    {
      bucket: '',
      ext: ext,
      filename: filename,
      local: false,
      nos_product: 3,
      type: 'audio',
      md5: query.songFile.md5,
    },
    createOption(query),
  )

  if (!tokenRes.body.result || !tokenRes.body.result.resourceId) {
    logger.error('Token allocation failed:', tokenRes.body)
    return Promise.reject({
      status: 500,
      body: {
        code: 500,
        msg: '获取上传token失败',
        detail: tokenRes.body,
      },
    })
  }

  if (res.body.needUpload) {
    logger.info('Need upload, starting upload process...')
    try {
      const uploadInfo = await uploadPlugin(query, request)
      logger.info('Upload completed:', uploadInfo?.body?.result?.resourceId)
    } catch (uploadError) {
      logger.error('Upload failed:', uploadError)
      return Promise.reject(uploadError)
    }
  } else {
    logger.info('File already exists, skip upload')
  }

  const res2 = await request(
    `/api/upload/cloud/info/v2`,
    {
      md5: query.songFile.md5,
      songid: res.body.songId,
      filename: query.songFile.name,
      song: songName || filename,
      album: album || '未知专辑',
      artist: artist || '未知艺术家',
      bitrate: String(bitrate),
      resourceId: tokenRes.body.result.resourceId,
    },
    createOption(query),
  )

  if (res2.body.code !== 200 && res2.body.code !== 200) {
    logger.error('Cloud info upload failed:', res2.body)
    return Promise.reject({
      status: res2.status || 500,
      body: {
        code: res2.body.code || 500,
        msg: res2.body.msg || '上传云盘信息失败',
        detail: res2.body,
      },
    })
  }

  const res3 = await request(
    `/api/cloud/pub/v2`,
    {
      songid: res2.body.songId,
    },
    createOption(query),
  )
  return {
    status: 200,
    body: {
      ...res.body,
      ...res3.body,
    },
    cookie: res.cookie,
  }
}

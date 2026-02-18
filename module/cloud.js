const uploadPlugin = require('../plugins/songUpload')
const crypto = require('crypto')
const fs = require('fs')
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

  const useTempFile = !!query.songFile.tempFilePath
  let fileSize = query.songFile.size
  let fileMd5 = query.songFile.md5

  if (useTempFile) {
    const stats = fs.statSync(query.songFile.tempFilePath)
    fileSize = stats.size
    if (!fileMd5) {
      fileMd5 = await new Promise((resolve, reject) => {
        const hash = crypto.createHash('md5')
        const stream = fs.createReadStream(query.songFile.tempFilePath)
        stream.on('data', (chunk) => hash.update(chunk))
        stream.on('end', () => resolve(hash.digest('hex')))
        stream.on('error', reject)
      })
    }
  } else {
    if (!fileMd5) {
      fileMd5 = crypto.createHash('md5').update(query.songFile.data).digest('hex')
    }
    fileSize = query.songFile.data.byteLength
  }

  query.songFile.md5 = fileMd5
  query.songFile.size = fileSize

  const res = await request(
    `/api/cloud/upload/check`,
    {
      bitrate: String(bitrate),
      ext: '',
      length: fileSize,
      md5: fileMd5,
      songId: '0',
      version: 1,
    },
    createOption(query),
  )
  let artist = ''
  let album = ''
  let songName = ''
  try {
    let metadata
    if (useTempFile) {
      metadata = await mm.parseFile(query.songFile.tempFilePath)
    } else {
      metadata = await mm.parseBuffer(
        query.songFile.data,
        query.songFile.mimetype,
      )
    }
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
      md5: fileMd5,
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
    } finally {
      if (useTempFile && fs.existsSync(query.songFile.tempFilePath)) {
        fs.unlinkSync(query.songFile.tempFilePath)
      }
    }
  } else {
    logger.info('File already exists, skip upload')
    if (useTempFile && fs.existsSync(query.songFile.tempFilePath)) {
      fs.unlinkSync(query.songFile.tempFilePath)
    }
  }

  const res2 = await request(
    `/api/upload/cloud/info/v2`,
    {
      md5: fileMd5,
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

  if (res2.body.code !== 200) {
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

const { default: axios } = require('axios')
const fs = require('fs')
var xml2js = require('xml2js')

const createOption = require('../util/option.js')
const { getFileExtension, readFileChunk } = require('../util/fileHelper')

var parser = new xml2js.Parser()

function createDupkey() {
  var s = []
  var hexDigits = '0123456789abcdef'
  for (var i = 0; i < 36; i++) {
    s[i] = hexDigits.substr(Math.floor(Math.random() * 0x10), 1)
  }
  s[14] = '4'
  s[19] = hexDigits.substr((s[19] & 0x3) | 0x8, 1)
  s[8] = s[13] = s[18] = s[23] = '-'
  return s.join('')
}

module.exports = async (query, request) => {
  const ext = getFileExtension(query.songFile.name)
  const filename =
    query.songName ||
    query.songFile.name
      .replace('.' + ext, '')
      .replace(/\s/g, '')
      .replace(/\./g, '_')

  if (!query.songFile) {
    return Promise.reject({
      status: 500,
      body: {
        msg: '请上传音频文件',
        code: 500,
      },
    })
  }

  const tokenRes = await request(
    `/api/nos/token/alloc`,
    {
      bucket: 'ymusic',
      ext: ext,
      filename: filename,
      local: false,
      nos_product: 0,
      type: 'other',
    },
    createOption(query, 'weapi'),
  )

  const objectKey = tokenRes.body.result.objectKey.replace(/\//g, '%2F')
  const docId = tokenRes.body.result.docId
  const res = await axios({
    method: 'post',
    url: `https://ymusic.nos-hz.163yun.com/${objectKey}?uploads`,
    headers: {
      'x-nos-token': tokenRes.body.result.token,
      'X-Nos-Meta-Content-Type': query.songFile.mimetype || 'audio/mpeg',
    },
    data: null,
  })

  const res2 = await parser.parseStringPromise(res.data)

  const useTempFile = !!query.songFile.tempFilePath
  let fileSize = query.songFile.size

  if (useTempFile) {
    const stats = await fs.promises.stat(query.songFile.tempFilePath)
    fileSize = stats.size
  }

  const blockSize = 10 * 1024 * 1024
  let offset = 0
  let blockIndex = 1

  let etags = []

  while (offset < fileSize) {
    let chunk
    if (useTempFile) {
      chunk = await readFileChunk(
        query.songFile.tempFilePath,
        offset,
        Math.min(blockSize, fileSize - offset),
      )
    } else {
      chunk = query.songFile.data.slice(
        offset,
        Math.min(offset + blockSize, fileSize),
      )
    }

    const res3 = await axios({
      method: 'put',
      url: `https://ymusic.nos-hz.163yun.com/${objectKey}?partNumber=${blockIndex}&uploadId=${res2.InitiateMultipartUploadResult.UploadId[0]}`,
      headers: {
        'x-nos-token': tokenRes.body.result.token,
        'Content-Type': query.songFile.mimetype || 'audio/mpeg',
      },
      data: chunk,
    })
    const etag = res3.headers.etag
    etags.push(etag)
    offset += blockSize
    blockIndex++
  }

  let completeStr = '<CompleteMultipartUpload>'
  for (let i = 0; i < etags.length; i++) {
    completeStr += `<Part><PartNumber>${i + 1}</PartNumber><ETag>${
      etags[i]
    }</ETag></Part>`
  }
  completeStr += '</CompleteMultipartUpload>'

  await axios({
    method: 'post',
    url: `https://ymusic.nos-hz.163yun.com/${objectKey}?uploadId=${res2.InitiateMultipartUploadResult.UploadId[0]}`,
    headers: {
      'Content-Type': 'text/plain;charset=UTF-8',
      'X-Nos-Meta-Content-Type': query.songFile.mimetype || 'audio/mpeg',
      'x-nos-token': tokenRes.body.result.token,
    },
    data: completeStr,
  })

  await request(
    `/api/voice/workbench/voice/batch/upload/preCheck`,
    {
      dupkey: createDupkey(),
      voiceData: JSON.stringify([
        {
          name: filename,
          autoPublish: query.autoPublish == 1 ? true : false,
          autoPublishText: query.autoPublishText || '',
          description: query.description,
          voiceListId: query.voiceListId,
          coverImgId: query.coverImgId,
          dfsId: docId,
          categoryId: query.categoryId,
          secondCategoryId: query.secondCategoryId,
          composedSongs: query.composedSongs
            ? query.composedSongs.split(',')
            : [],
          privacy: query.privacy == 1 ? true : false,
          publishTime: query.publishTime || 0,
          orderNo: query.orderNo || 1,
        },
      ]),
    },
    {
      ...createOption(query),
      headers: {
        'x-nos-token': tokenRes.body.result.token,
      },
    },
  )
  const result = await request(
    `/api/voice/workbench/voice/batch/upload/v2`,
    {
      dupkey: createDupkey(),
      voiceData: JSON.stringify([
        {
          name: filename,
          autoPublish: query.autoPublish == 1 ? true : false,
          autoPublishText: query.autoPublishText || '',
          description: query.description,
          voiceListId: query.voiceListId,
          coverImgId: query.coverImgId,
          dfsId: docId,
          categoryId: query.categoryId,
          secondCategoryId: query.secondCategoryId,
          composedSongs: query.composedSongs
            ? query.composedSongs.split(',')
            : [],
          privacy: query.privacy == 1 ? true : false,
          publishTime: query.publishTime || 0,
          orderNo: query.orderNo || 1,
        },
      ]),
    },
    {
      ...createOption(query),
      headers: {
        'x-nos-token': tokenRes.body.result.token,
      },
    },
  )
  return {
    status: 200,
    body: {
      code: 200,
      data: result.body.data,
    },
  }
}

const createOption = require('../util/option.js')

module.exports = async (query, request) => {
  const {
    songId,
    resourceId,
    md5,
    filename,
    song,
    artist,
    album,
    bitrate = 999000,
  } = query

  if (!songId || !resourceId || !md5 || !filename) {
    return Promise.reject({
      status: 400,
      body: {
        code: 400,
        msg: '缺少必要参数: songId, resourceId, md5, filename',
      },
    })
  }

  const songName = song || filename.replace(/\.[^.]+$/, '')

  const res2 = await request(
    `/api/upload/cloud/info/v2`,
    {
      md5: md5,
      songid: songId,
      filename: filename,
      song: songName,
      album: album || '未知专辑',
      artist: artist || '未知艺术家',
      bitrate: String(bitrate),
      resourceId: resourceId,
    },
    createOption(query),
  )

  if (res2.body.code !== 200) {
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
      code: 200,
      data: {
        songId: res2.body.songId,
        ...res3.body,
      },
    },
    cookie: res2.cookie,
  }
}

const fs = require('fs')
const crypto = require('crypto')
const logger = require('./logger')

function isTempFile(file) {
  return !!(file && file.tempFilePath)
}

async function getFileSize(file) {
  if (isTempFile(file)) {
    const stats = await fs.promises.stat(file.tempFilePath)
    return stats.size
  }
  return file.data ? file.data.byteLength : file.size || 0
}

async function getFileMd5(file) {
  if (file.md5) {
    return file.md5
  }

  if (isTempFile(file)) {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('md5')
      const stream = fs.createReadStream(file.tempFilePath)
      stream.on('data', (chunk) => hash.update(chunk))
      stream.on('end', () => resolve(hash.digest('hex')))
      stream.on('error', reject)
    })
  }

  if (file.data) {
    return crypto.createHash('md5').update(file.data).digest('hex')
  }

  throw new Error('无法计算文件MD5: 缺少文件数据')
}

function getUploadData(file) {
  if (isTempFile(file)) {
    return fs.createReadStream(file.tempFilePath)
  }
  return file.data
}

async function cleanupTempFile(filePath) {
  if (!filePath) return
  try {
    await fs.promises.unlink(filePath)
  } catch (e) {
    logger.info('临时文件清理失败:', e.message)
  }
}

async function readFileChunk(filePath, offset, length) {
  const fd = await fs.promises.open(filePath, 'r')
  const buffer = Buffer.alloc(length)
  await fd.read(buffer, 0, length, offset)
  await fd.close()
  return buffer
}

function getFileExtension(filename) {
  if (!filename) return 'mp3'
  if (filename.includes('.')) {
    return filename.split('.').pop().toLowerCase()
  }
  return 'mp3'
}

function sanitizeFilename(filename) {
  if (!filename) return 'unknown'
  return filename
    .replace(/\.[^.]+$/, '')
    .replace(/\s/g, '')
    .replace(/\./g, '_')
}

module.exports = {
  isTempFile,
  getFileSize,
  getFileMd5,
  getUploadData,
  cleanupTempFile,
  readFileChunk,
  getFileExtension,
  sanitizeFilename,
}

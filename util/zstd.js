const zlib = require('zlib')
const { decompress: fzstdDecompress } = require('fzstd')

// Node 22.15+ 自带 zstd。更早的版本（CI 含 18）用 fzstd 解压，压缩则退回到
// raw block 帧：内容原样存储，任何 zstd 解码器都能读，只是没有压缩率。
const hasNative = typeof zlib.zstdCompressSync === 'function'

const MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])
const WINDOW_DESCRIPTOR = 0x50 // windowLog 20
const BLOCK_MAX = 0x20000 // zstd 单块上限 128 KiB

const compressRawFrame = (input) => {
  const parts = [MAGIC, Buffer.from([0x00, WINDOW_DESCRIPTOR])]
  let offset = 0
  do {
    const block = input.subarray(offset, offset + BLOCK_MAX)
    const last = offset + BLOCK_MAX >= input.length
    const header = Buffer.alloc(3)
    header.writeUIntLE((block.length << 3) | (last ? 1 : 0), 0, 3)
    parts.push(header, block)
    offset += BLOCK_MAX
  } while (offset < input.length)
  return Buffer.concat(parts)
}

const compress = (input) => {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input)
  return hasNative ? zlib.zstdCompressSync(buf) : compressRawFrame(buf)
}

const decompress = (input) => {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input)
  return hasNative
    ? zlib.zstdDecompressSync(buf)
    : Buffer.from(fzstdDecompress(buf))
}

module.exports = {
  compress,
  decompress,
}

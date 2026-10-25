const crypto = require('crypto')
const zstd = require('./zstd')

// gorilla/algorithm/record 返回的 base64 解码后：
//   [0  .. 64)   RSA 块        -> RSA_PKCS1 去填充得到 RC4 密钥
//   [64 .. 68)   u32 LE 载荷长度
//   [68 .. )     RC4 载荷      -> zstd 解压得到 ECFG 容器
const CONFIG_PUBLIC_KEY = Buffer.from(
  '3048024100e4e79c1cb27a9fab7d2c740e99e923ec51c009169ec3a380c60404' +
    'e01b060f0160cdc631d9fb7fe53b228a5ff11bee42b965d28c6c2036193f4ccd' +
    'c7ed853d110203010001',
  'hex',
)

// 容器里的 Lua 区块对指令和字符串做了逐字节异或混淆
const CODE_XOR = [
  0x94b4f825, 0x977c6795, 0x327de32b, 0x16da5ba1, 0xcf55a2eb, 0x080bb445,
  0x021af055, 0xfc56b8bd,
]
const STR_XOR = Buffer.from('aefda2d1832b518a7741c325fb2687f0', 'hex')
const CHUNK_SIGNATURE = Buffer.from('7f454c46', 'hex')

// 脚本用这两个标记区分请求方向与响应方向
const DIRECTION_ENCRYPT = 251
const DIRECTION_DECRYPT = 503
const KEY_LEN = 32

const T_NUMFLT = 3
const T_NUMINT = 19
const OP_LOADK = 1
const OP_GETUPVAL = 5
const OP_EQ = 31

const op = (ins) => ins & 0x3f
const argA = (ins) => (ins >>> 6) & 0xff
const argB = (ins) => (ins >>> 23) & 0x1ff
const argC = (ins) => (ins >>> 14) & 0x1ff
const argBx = (ins) => (ins >>> 14) & 0x3ffff

const rc4 = (key, data) => {
  const s = Buffer.alloc(256)
  for (let i = 0; i < 256; i++) s[i] = i

  let j = 0
  for (let i = 0; i < 256; i++) {
    j = (j + s[i] + key[i % key.length]) & 0xff
    ;[s[i], s[j]] = [s[j], s[i]]
  }

  const out = Buffer.allocUnsafe(data.length)
  let i = 0
  j = 0
  for (let n = 0; n < data.length; n++) {
    i = (i + 1) & 0xff
    j = (j + s[i]) & 0xff
    ;[s[i], s[j]] = [s[j], s[i]]
    out[n] = data[n] ^ s[(s[i] + s[j]) & 0xff]
  }
  return out
}

const unwrapContainer = (raw) => {
  const key = crypto.publicDecrypt(
    crypto.createPublicKey({
      key: CONFIG_PUBLIC_KEY,
      format: 'der',
      type: 'pkcs1',
    }),
    raw.subarray(0, 64),
  )
  const size = raw.readUInt32LE(64)
  return zstd.decompress(rc4(key, raw.subarray(68, 68 + size)))
}

class ChunkReader {
  constructor(buf, pos = 0) {
    this.buf = buf
    this.pos = pos
  }

  u8() {
    return this.buf[this.pos++]
  }

  u32() {
    const value = this.buf.readUInt32LE(this.pos)
    this.pos += 4
    return value
  }

  i64() {
    const value = this.buf.readBigInt64LE(this.pos)
    this.pos += 8
    return Number(value)
  }

  f64() {
    const value = this.buf.readDoubleLE(this.pos)
    this.pos += 8
    return value
  }

  string() {
    let size = this.u8()
    if (size === 0) return null
    if (size === 0xff) size = this.u32()
    // 长度比实际字节数多 1（标准 luac 的写法）
    const body = this.buf.subarray(this.pos, this.pos + size - 1)
    this.pos += size - 1
    const out = Buffer.allocUnsafe(body.length)
    for (let i = 0; i < body.length; i++) {
      out[i] = body[i] ^ STR_XOR[i & 0x0f]
    }
    return out.toString('utf8')
  }
}

const loadProto = (r) => {
  const proto = {
    source: r.string(),
    linedefined: r.u32(),
    lastlinedefined: r.u32(),
    numparams: r.u8(),
    isvararg: r.u8(),
    maxstack: r.u8(),
  }

  let count = r.u32()
  proto.code = new Array(count)
  for (let i = 0; i < count; i++) {
    proto.code[i] = (r.u32() ^ CODE_XOR[i & 7]) >>> 0
  }

  // 常量标签：0 nil / 1 boolean / 3 float / 19 integer / 4,20 string
  // 只保留用得到的整数与字符串
  count = r.u32()
  proto.consts = new Array(count)
  for (let i = 0; i < count; i++) {
    const tag = r.u8()
    if (tag === 0) proto.consts[i] = null
    else if (tag === 1) {
      r.u8()
      proto.consts[i] = null
    } else if (tag === T_NUMFLT) {
      r.f64()
      proto.consts[i] = null
    } else if (tag === T_NUMINT) proto.consts[i] = r.i64()
    else proto.consts[i] = r.string()
  }

  count = r.u32()
  proto.upvals = new Array(count)
  for (let i = 0; i < count; i++) {
    proto.upvals[i] = [r.u8(), r.u8()]
  }

  count = r.u32()
  proto.protos = new Array(count)
  for (let i = 0; i < count; i++) {
    proto.protos[i] = loadProto(r)
  }

  // 调试段跳过即可
  count = r.u32()
  r.pos += 4 * count
  count = r.u32()
  for (let i = 0; i < count; i++) {
    r.string()
    r.u32()
    r.u32()
  }
  count = r.u32()
  for (let i = 0; i < count; i++) {
    r.string()
  }
  return proto
}

const loadChunk = (buf) => {
  if (!buf.subarray(0, 4).equals(CHUNK_SIGNATURE)) {
    throw new Error('neapi config is not a chunk')
  }
  const r = new ChunkReader(buf, 33)
  r.u8() // 主闭包 upvalue 数量
  return loadProto(r)
}

// 主函数用一连串 LOADK 装载所有标量，据此可以把 upvalue 追回常量值
const mainRegisters = (main) => {
  const regs = new Map()
  for (const ins of main.code) {
    if (op(ins) === OP_LOADK) regs.set(argA(ins), main.consts[argBx(ins)])
  }
  return regs
}

// create_ctx 里方向 -> 密钥偏移的分支：
//   if direction == <a> then offset = <upvalue>
//   elseif direction == <b> then offset = <upvalue>
const extractKeyOffsets = (script) => {
  const createCtx = script.protos[0]
  const regs = mainRegisters(script)
  const offsets = {}
  let pending = null

  for (const ins of createCtx.code) {
    const code = op(ins)
    if (code === OP_EQ) {
      const c = argC(ins)
      const constant = c & 0x100 && createCtx.consts[c & 0xff]
      if (Number.isInteger(constant)) pending = constant
    } else if (code === OP_GETUPVAL && pending !== null) {
      const up = createCtx.upvals[argB(ins)]
      const constant = up && up[0] === 1 && regs.get(up[1])
      if (Number.isInteger(constant)) {
        offsets[pending] = constant
        pending = null
      }
    }
  }

  if (!(DIRECTION_ENCRYPT in offsets) || !(DIRECTION_DECRYPT in offsets)) {
    throw new Error('neapi config script has an unexpected direction table')
  }
  return offsets
}

const extractKeyBlob = (script) => {
  const blob = script.consts
    .filter(
      (c) => typeof c === 'string' && /^[A-Za-z0-9+/]{64,}={0,2}$/.test(c),
    )
    .sort((a, b) => b.length - a.length)[0]
  return Buffer.from(blob, 'base64')
}

const decodeConfig = (raw) => {
  const ecfg = unwrapContainer(raw)
  // ECFG 头 4 字节 + 大端 u16 版本，之后是 Lua 区块
  const version = ecfg.readUInt16BE(4)
  const script = loadChunk(ecfg.subarray(6))

  const offsets = extractKeyOffsets(script)
  const keyBlob = extractKeyBlob(script)
  const slice = (direction) =>
    keyBlob.subarray(offsets[direction], offsets[direction] + KEY_LEN)

  return {
    version,
    keyBlob,
    encryptKey: slice(DIRECTION_ENCRYPT),
    decryptKey: slice(DIRECTION_DECRYPT),
  }
}

module.exports = {
  decodeConfig,
}

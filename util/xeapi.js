/**
 * xeapi (Aegis) 加密/解密实现
 *
 * 基于 Netease CloudMusic Android APK libAegisSDK.so 逆向分析
 *
 * 三层加密架构:
 *   Layer 1 (Business Data): 双重 AES-256-GCM (静态密钥 → Base64 → 动态密钥)
 *   Layer 2 (Session Key):   ECDH(P-256) + HKDF-SHA256 + AES-256-GCM
 *   Layer 3 (Version Info):  AES-256-GCM (静态密钥)
 *
 * 响应解密: AES-256-GCM (动态密钥)
 *
 * @see issue.md - 完整逆向文档
 */
const crypto = require('crypto')

// ============================================================
// 常量定义
// ============================================================

/** XOR 解码密钥 (从 p62/f.smali h() 提取) */
const XOR_KEY = Buffer.from([0xa1, 0xa3, 0xa2, 0xa3])

/**
 * XOR 解码 (用于解密 APK 中的混淆字符串)
 *
 * 流程:
 *   输入 XOR 编码后的 base64 → Base64 解码 → XOR → 得到 ASCII base64 → Base64 解码
 *
 * @param {string} input - XOR 编码后的 base64 输入
 * @returns {Buffer} 解码后的原始字节
 */
function xorDecode(input) {
  const buf = Buffer.from(input, 'base64')
  for (let i = 0; i < buf.length; i++) buf[i] ^= XOR_KEY[i % 4]
  return Buffer.from(buf.toString('utf-8'), 'base64')
}

/**
 * 静态 AES-256 密钥
 *
 * 🟡 待确认: 从 libAegisSDK.so / p62/f.smali h() 提取
 *    可通过环境变量 XEAPI_STATIC_KEY (hex, 64字符) 覆盖
 *
 * 目前使用来自 issue.md 的参考值 (可能不完整, 自动填充到32字节)
 * 请从运行中的 Android 客户端提取正确的 64 字符 hex 密钥后设置环境变量
 */
const STATIC_AES_KEY = (() => {
  const envKey = process.env.XEAPI_STATIC_KEY
  if (envKey) {
    const buf = Buffer.from(envKey, 'hex')
    if (buf.length === 32) return buf
    console.warn(
      `[xeapi] ⚠️  环境变量 XEAPI_STATIC_KEY 长度错误 (期望 64 hex 字符, 实际 ${envKey.length}), 使用默认密钥`,
    )
  }

  // 参考值 (issue.md 提供, 可能不完整)
  const keyHex = 'b31d1a4bf2ba849fe97edd55727d896dc1ed9ee492c0e86947c6dfb93b1'
  const key = Buffer.from(keyHex, 'hex')

  if (key.length < 32) {
    console.warn(
      `[xeapi] ⚠️  静态密钥长度 ${key.length} 字节, 自动填充到 32 字节. ` +
        `建议通过 XEAPI_STATIC_KEY 环境变量设置正确的 64 字符 hex 密钥`,
    )
    const padded = Buffer.alloc(32, 0)
    key.copy(padded)
    return padded
  }
  return key.subarray(0, 32)
})()

/**
 * HKDF salt
 * 🟡 待从 libAegisSDK.so DAT_001a04c0 提取 (Ghidra read_memory)
 * 这是一个 16 字节的全局数据，目前使用占位符
 */
const HKDF_SALT = Buffer.alloc(16, 0)

/**
 * 版本字符串
 * 🟡 待从 DAT_001a92e6 提取
 */
const VERSION = '1.0'

/**
 * 默认服务器 ECC 公钥 (P-256 x-coordinate, base64 编码)
 * 🟡 需从 Android 应用 <filesdir>/aegissdk/public_key 提取
 *
 * 可通过环境变量 XEAPI_SERVER_PUBLIC_KEY 或在 options 中传入
 */
const DEFAULT_SERVER_PUBLIC_KEY = process.env.XEAPI_SERVER_PUBLIC_KEY || ''

// ============================================================
// 辅助函数
// ============================================================

/**
 * 将 16 字节密钥填充为 32 字节 (AES-256 需要 32 字节密钥)
 * 在末尾补零
 */
function padKeyTo32(key) {
  // 兼容 ArrayBuffer (crypto.hkdfSync 在某些 Node 版本返回 ArrayBuffer)
  if (key instanceof ArrayBuffer || ArrayBuffer.isView(key)) {
    key = Buffer.from(key)
  }
  if (!Buffer.isBuffer(key)) {
    key = Buffer.from(key)
  }
  if (key.length >= 32) return key.subarray(0, 32)
  return Buffer.concat([key, Buffer.alloc(32 - key.length, 0)])
}

/**
 * AES-256-GCM 加密
 *
 * @param {Buffer} plaintext - 明文
 * @param {Buffer} key - 32 字节密钥
 * @param {number} [ivLength=16] - IV 长度 (12 或 16)
 * @returns {Buffer} IV(16) + ciphertext + tag(16)
 */
function aes256GcmEncrypt(plaintext, key, ivLength = 16) {
  const iv = crypto.randomBytes(ivLength)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, encrypted, tag])
}

/**
 * AES-256-GCM 加密 (使用指定 IV)
 *
 * @param {Buffer} plaintext - 明文
 * @param {Buffer} key - 32 字节密钥
 * @param {Buffer} iv - 指定 IV
 * @returns {Buffer} ciphertext + tag(16) (不含 IV 前缀)
 */
function aes256GcmEncryptWithIv(plaintext, key, iv) {
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([encrypted, tag])
}

/**
 * AES-256-GCM 解密
 *
 * @param {Buffer} ciphertextWithIv - IV(16/12) + ciphertext + tag(16)
 * @param {Buffer} key - 32 字节密钥
 * @param {number} [ivLength=16] - IV 长度
 * @returns {Buffer} 解密后的明文
 */
function aes256GcmDecrypt(ciphertextWithIv, key, ivLength = 16) {
  const iv = ciphertextWithIv.subarray(0, ivLength)
  const tag = ciphertextWithIv.subarray(-16)
  const data = ciphertextWithIv.subarray(ivLength, -16)

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(data), decipher.final()])
}

// ============================================================
// Layer 1: 加密业务数据 (EncryptBusinessData)
// ============================================================

/**
 * 第 1 层加密 - 双重 AES-256-GCM
 *
 * plaintext (JSON)
 *   ├─ [Round 1] 静态 AES-256-GCM (随机 16-byte IV)
 *   │    输出: [IV(16)] [ciphertext] [tag(16)]
 *   └─ Base64 编码
 *      └─ [Round 2] 动态 AES-256-GCM (动态密钥填充到 32 字节, 随机 16-byte IV)
 *           输出: [IV(16)] [ciphertext] [tag(16)] = cipherB
 *
 * @param {Buffer} plaintext - JSON 明文字节
 * @param {Buffer} dynamicKey - 16 字节动态密钥
 * @returns {Buffer} cipherB
 */
function encryptLayer1(plaintext, dynamicKey) {
  // Round 1: 静态 AES-256-GCM
  const round1 = aes256GcmEncrypt(plaintext, STATIC_AES_KEY, 16)

  // Base64 编码 Round 1 输出
  const round1B64 = Buffer.from(round1.toString('base64'))

  // Round 2: 动态 AES-256-GCM (密钥填充到 32 字节)
  const dk32 = padKeyTo32(dynamicKey)
  const cipherB = aes256GcmEncrypt(round1B64, dk32, 16)

  return cipherB
}

// ============================================================
// Layer 2: 加密动态密钥 (EncryptDynamicKey)
// ============================================================

/**
 * P-256 点解压缩
 * 将 32 字节 x 坐标转换为完整的未压缩公钥 (65 字节)
 *
 * @param {Buffer} xBytes - 32 字节 x 坐标
 * @returns {Buffer} 65 字节未压缩公钥 (0x04 + x + y)
 */
function decompressP256Point(xBytes) {
  // P-256曲线参数
  // y² = x³ - 3x + b (mod p)
  const p = BigInt(
    '0xffffffff00000001000000000000000000000000ffffffffffffffffffffffff',
  )
  const b = BigInt(
    '0x5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604b',
  )
  const three = BigInt(3)

  // 将 x 转换为 BigInt
  const x = BigInt('0x' + xBytes.toString('hex'))

  // 计算 alpha = x³ - 3x + b (mod p)
  const x3 = (x * x * x) % p
  const minus3x = (p - ((three * x) % p)) % p // 等同于 -3x mod p
  const alpha = (x3 + minus3x + b) % p

  // 计算 y = sqrt(alpha) mod p
  // 对于 P-256: p ≡ 3 mod 4, 所以 sqrt(a) = a^((p+1)/4) mod p
  const exp = (p + BigInt(1)) / BigInt(4)
  const y = modPow(alpha, exp, p)

  // 拼接未压缩公钥: 0x04 + x(32) + y(32) = 65 bytes
  const yBytes = Buffer.from(y.toString(16).padStart(64, '0'), 'hex')
  return Buffer.concat([Buffer.from([0x04]), xBytes, yBytes])
}

/**
 * 大数模幂运算 (BigInt)
 * 计算 (base^exp) % mod
 */
function modPow(base, exp, mod) {
  let result = BigInt(1)
  base = base % mod
  while (exp > 0) {
    if (exp & BigInt(1)) result = (result * base) % mod
    exp = exp >> BigInt(1)
    base = (base * base) % mod
  }
  return result
}

/**
 * 第 2 层加密 - ECDH(P-256) + HKDF-SHA256 + AES-256-GCM
 *
 * 服务器公钥 (base64 解码 → 32 字节 x 坐标)
 *   ├─ 客户端生成临时 ECC 密钥对 (P-256)
 *   ├─ ECDH 密钥协商:
 *   │     共享密钥 = clientPrivate × serverPublic
 *   ├─ HKDF-SHA256 派生:
 *   │     IKM = 共享密钥
 *   │     salt = DAT_001a04c0 (16 字节)
 *   │     info = clientEphemeralPubKey (65 字节)
 *   │     L = 16 字节 → derivedKey
 *   └─ AES-256-GCM 加密 (12 字节 IV)
 *        明文 = base64(dynamicKey) + " " + base64(serverPubKey) + " " + version
 *        输出 cipherS = [clientPubKey(65)] [IV(12)] [ciphertext] [tag(16)]
 *
 * @param {Buffer} dynamicKey - 16 字节动态密钥
 * @param {string} serverPublicKeyBase64 - 服务器公钥 (base64, 32 字节 x 坐标)
 * @returns {Buffer} cipherS
 */
function encryptLayer2(dynamicKey, serverPublicKeyBase64) {
  // 如果没有服务器公钥，生成一个临时密钥对用于测试/占位
  if (!serverPublicKeyBase64) {
    console.warn(
      '[xeapi] ⚠️  服务器公钥为空，使用临时密钥占位 (此加密无法被真实服务器解密)',
    )
    const tempEcdh = crypto.createECDH('prime256v1')
    tempEcdh.generateKeys()
    serverPublicKeyBase64 = tempEcdh
      .getPublicKey(null, 'compressed')
      .toString('base64')
  }

  // 生成客户端临时 ECC 密钥对
  const ecdh = crypto.createECDH('prime256v1')
  ecdh.generateKeys()
  const clientPubKey = ecdh.getPublicKey(null, 'uncompressed') // 65 字节

  // 服务器公钥解码
  const spkBuf = Buffer.from(serverPublicKeyBase64, 'base64')

  let serverPublicKey
  if (spkBuf.length === 33 && (spkBuf[0] === 0x02 || spkBuf[0] === 0x03)) {
    // 压缩格式公钥: 0x02/0x03 + x(32)
    serverPublicKey = spkBuf
  } else if (spkBuf.length === 65 && spkBuf[0] === 0x04) {
    // 未压缩格式公钥: 0x04 + x(32) + y(32)
    serverPublicKey = spkBuf
  } else if (spkBuf.length === 32) {
    // 只有 x 坐标 → 解压缩
    serverPublicKey = decompressP256Point(spkBuf)
  } else {
    // 可能是未压缩或压缩格式但缺少标识字节, 尝试解压缩
    try {
      serverPublicKey = decompressP256Point(spkBuf.subarray(0, 32))
    } catch {
      serverPublicKey = spkBuf
    }
  }

  // ECDH 密钥协商
  const sharedSecret = ecdh.computeSecret(serverPublicKey)

  // HKDF-SHA256 派生
  const derivedKey = crypto.hkdfSync(
    'sha256',
    sharedSecret,
    HKDF_SALT,
    clientPubKey, // info = 客户端临时公钥
    16, // 输出 16 字节
  )

  // AES-256-GCM 加密 (12 字节 IV)
  const iv = crypto.randomBytes(12)
  const dk32 = padKeyTo32(derivedKey)

  // 明文: base64(dynamicKey) + " " + base64(serverPubKeyBase64) + " " + version
  const plaintext = Buffer.concat([
    Buffer.from(dynamicKey.toString('base64')),
    Buffer.from(' '),
    Buffer.from(serverPublicKeyBase64),
    Buffer.from(' '),
    Buffer.from(VERSION),
  ])

  const encResult = aes256GcmEncryptWithIv(plaintext, dk32, iv)

  // cipherS = [clientPubKey(65)] [IV(12)] [encResult(ct+tag)]
  return Buffer.concat([clientPubKey, iv, encResult])
}

// ============================================================
// Layer 3: 加密版本信息 (EncryptVersionInfo)
// ============================================================

/**
 * 第 3 层加密 - AES-256-GCM (静态密钥)
 *
 * 明文: version|sessionId (例如 "1.0|")
 * IV: 随机 16 字节
 * 输出 cipherR = [IV(16)] [ciphertext] [tag(16)]
 *
 * @returns {Buffer} cipherR
 */
function encryptLayer3(sessionId = '') {
  const plaintext = Buffer.from(`${VERSION}|${sessionId}`)
  return aes256GcmEncrypt(plaintext, STATIC_AES_KEY, 16)
}

// ============================================================
// 主加密函数
// ============================================================

/**
 * xeapi 加密入口
 *
 * 对业务数据进行三层加密，生成 { B, S, R } 参数
 *
 * @param {Object|string} data - 业务数据 (JSON 对象或字符串)
 * @param {Object} [options] - 加密选项
 * @param {string} [options.serverPublicKey] - 服务器 ECC 公钥 (base64)
 * @param {Buffer} [options.dynamicKey] - 指定动态密钥 (不指定则随机生成)
 * @returns {{ params: { B: string, S: string, R: string }, dynamicKey: Buffer }}
 */
function xeapiEncrypt(data, options = {}) {
  const serverKey = options.serverPublicKey || DEFAULT_SERVER_PUBLIC_KEY

  if (!serverKey) {
    console.warn(
      '[xeapi] ⚠️  服务器公钥未设置！请通过 options.serverPublicKey 或环境变量 XEAPI_SERVER_PUBLIC_KEY 设置',
    )
  }

  // 将数据序列化为 JSON
  const plaintext = Buffer.from(
    typeof data === 'string' ? data : JSON.stringify(data),
  )

  // 生成随机 16 字节动态密钥
  const dynamicKey = options.dynamicKey || crypto.randomBytes(16)

  // 第 1 层: 加密业务数据
  const cipherB = encryptLayer1(plaintext, dynamicKey)

  // 第 2 层: 加密动态密钥
  const cipherS = encryptLayer2(dynamicKey, serverKey)

  // 第 3 层: 加密版本信息
  const cipherR = encryptLayer3()

  return {
    params: {
      B: cipherB.toString('base64'),
      S: cipherS.toString('base64'),
      R: cipherR.toString('base64'),
    },
    dynamicKey,
  }
}

// ============================================================
// 响应解密
// ============================================================

/**
 * 解密 xeapi 响应
 *
 * 响应格式: 直接 AES-256-GCM 加密的二进制密文 (无 Base64)
 *   [IV(16)] [ciphertext] [tag(16)]
 *
 * 使用请求时生成的动态密钥解密
 *
 * @param {Buffer} encryptedBuffer - 原始二进制加密响应体
 * @param {Buffer} dynamicKey - 16 字节动态密钥 (从 xeapiEncrypt 返回值获取)
 * @returns {Object} 解密后的 JSON 对象
 */
function xeapiDecryptResponse(encryptedBuffer, dynamicKey) {
  const dk32 = padKeyTo32(dynamicKey)
  const plaintext = aes256GcmDecrypt(encryptedBuffer, dk32, 16)
  return JSON.parse(plaintext.toString('utf-8'))
}

// ============================================================
// 导出
// ============================================================

module.exports = {
  // 常量
  STATIC_AES_KEY,
  HKDF_SALT,
  VERSION,
  XOR_KEY,
  DEFAULT_SERVER_PUBLIC_KEY,

  // 加密
  xeapiEncrypt,
  encryptLayer1,
  encryptLayer2,
  encryptLayer3,

  // 解密
  xeapiDecryptResponse,

  // 辅助
  padKeyTo32,
  aes256GcmEncrypt,
  aes256GcmDecrypt,
  decompressP256Point,
}

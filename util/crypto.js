const CryptoJS = require('crypto-js')
const crypto = require('crypto')
const forge = require('node-forge')
const zlib = require('zlib')
const iv = '0102030405060708'
const presetKey = '0CoJUm6Qyw8W8jud'
const linuxapiKey = 'rFgB&h#%2?^eDg:Q'
const base62 = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
const publicKey = `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDgtQn2JZ34ZC28NWYpAUd98iZ37BUrX/aKzmFbt7clFSs6sXqHauqKWqdtLkF2KexO40H1YTX8z2lSgBBOAxLsvaklV8k4cBFK9snQXE9/DDaFt6Rr7iVZMldczhC0JNgTz+SHXT6CBHuX3e9SdB1Ua44oncaTWz7OBGLbCiK45wIDAQAB
-----END PUBLIC KEY-----`
const eapiKey = 'e82ckenh8dichen8'
const xeapiStaticKey = Buffer.from(
  'ab1d5a430f6bb04a3f01e81ddd72bd916d5ce591248ac128714806d7f8fb1b84',
  'hex',
)
const xeapiSignKey =
  'mUHCwVNWJbunMqAHf5MImuirT6plvs6VSFW62MGHstFQxhBGdEoIhLItH3djc4+FB/OKty3+lL2rGeoFBpVe5g=='
const x25519SpkiPrefix = Buffer.from('302a300506032b656e032100', 'hex')

const aesEncrypt = (text, mode, key, iv, format = 'base64') => {
  let encrypted = CryptoJS.AES.encrypt(
    CryptoJS.enc.Utf8.parse(text),
    CryptoJS.enc.Utf8.parse(key),
    {
      iv: CryptoJS.enc.Utf8.parse(iv),
      mode: CryptoJS.mode[mode.toUpperCase()],
      padding: CryptoJS.pad.Pkcs7,
    },
  )
  if (format === 'base64') {
    return encrypted.toString()
  }

  return encrypted.ciphertext.toString().toUpperCase()
}
const aesDecrypt = (ciphertext, key, iv, format = 'base64') => {
  let bytes
  if (format === 'base64') {
    bytes = CryptoJS.AES.decrypt(ciphertext, CryptoJS.enc.Utf8.parse(key), {
      iv: CryptoJS.enc.Utf8.parse(iv),
      mode: CryptoJS.mode.ECB,
      padding: CryptoJS.pad.Pkcs7,
    })
  } else {
    bytes = CryptoJS.AES.decrypt(
      { ciphertext: CryptoJS.enc.Hex.parse(ciphertext) },
      CryptoJS.enc.Utf8.parse(key),
      {
        iv: CryptoJS.enc.Utf8.parse(iv),
        mode: CryptoJS.mode.ECB,
        padding: CryptoJS.pad.Pkcs7,
      },
    )
  }
  return bytes
}
const rsaEncrypt = (str, key) => {
  const forgePublicKey = forge.pki.publicKeyFromPem(key)
  const encrypted = forgePublicKey.encrypt(str, 'NONE')
  return forge.util.bytesToHex(encrypted)
}

const weapi = (object) => {
  const text = JSON.stringify(object)
  let secretKey = ''
  for (let i = 0; i < 16; i++) {
    secretKey += base62.charAt(Math.round(Math.random() * 61))
  }
  return {
    params: aesEncrypt(
      aesEncrypt(text, 'cbc', presetKey, iv),
      'cbc',
      secretKey,
      iv,
    ),
    encSecKey: rsaEncrypt(secretKey.split('').reverse().join(''), publicKey),
  }
}

const linuxapi = (object) => {
  const text = JSON.stringify(object)
  return {
    eparams: aesEncrypt(text, 'ecb', linuxapiKey, '', 'hex'),
  }
}

const eapi = (url, object) => {
  const text = typeof object === 'object' ? JSON.stringify(object) : object
  const message = `nobody${url}use${text}md5forencrypt`
  const digest = CryptoJS.MD5(message).toString()
  const data = `${url}-36cd479b6b5-${text}-36cd479b6b5-${digest}`
  return {
    params: aesEncrypt(data, 'ecb', eapiKey, '', 'hex'),
  }
}
const eapiResDecrypt = (encryptedParams, aeapi = false) => {
  // 使用aesDecrypt解密参数
  try {
    const decrypted = aesDecrypt(encryptedParams, eapiKey, '', 'hex') // WordArray

    if (aeapi) {
      // 带压缩的解密：先转 Base64 再解压
      const decryptedBuffer = Buffer.from(
        decrypted.toString(CryptoJS.enc.Base64),
        'base64',
      )
      const decompressed = zlib.gunzipSync(decryptedBuffer)
      return JSON.parse(decompressed.toString())
    } else {
      // 普通解密：直接转 UTF-8 字符串
      return JSON.parse(decrypted.toString(CryptoJS.enc.Utf8))
    }
  } catch (error) {
    console.log(`eapiResDecrypt error:`, error)
    return null
  }
}
const eapiReqDecrypt = (encryptedParams) => {
  // 使用 aesDecrypt 解密参数
  const decryptedData = aesDecrypt(
    encryptedParams,
    eapiKey,
    '',
    'hex',
  ).toString(CryptoJS.enc.Utf8)
  // 使用正则表达式解析出 URL 和数据
  const match = decryptedData.match(/(.*?)-36cd479b6b5-(.*?)-36cd479b6b5-(.*)/)
  if (match) {
    const url = match[1]
    const data = JSON.parse(match[2])
    return { url, data }
  }

  // 如果没有匹配到，返回 null
  return null
}
const decrypt = (cipher) => {
  const decipher = CryptoJS.AES.decrypt(
    {
      ciphertext: CryptoJS.enc.Hex.parse(cipher),
    },
    eapiKey,
    {
      mode: CryptoJS.mode.ECB,
    },
  )
  const decryptedBytes = CryptoJS.enc.Utf8.stringify(decipher)
  return decryptedBytes
}

const aesEcbEncrypt = (key, plaintext) => {
  const cipher = crypto.createCipheriv(`aes-${key.length * 8}-ecb`, key, null)
  return Buffer.concat([cipher.update(Buffer.from(plaintext)), cipher.final()])
}

const aesEcbDecrypt = (key, ciphertext) => {
  const decipher = crypto.createDecipheriv(
    `aes-${key.length * 8}-ecb`,
    key,
    null,
  )
  return Buffer.concat([decipher.update(ciphertext), decipher.final()])
}

const createX25519PublicKey = (raw) => {
  // Node's crypto API expects X25519 public keys as DER SubjectPublicKeyInfo.
  // The Android SDK stores only the 32-byte raw key, so prepend the fixed
  // RFC 8410 SPKI header for id-X25519 before importing it.
  return crypto.createPublicKey({
    key: Buffer.concat([x25519SpkiPrefix, raw]),
    format: 'der',
    type: 'spki',
  })
}

const deriveX25519AesKey = (sharedSecret, ephemeralPublicKey) => {
  const prk = crypto
    .createHmac('sha256', Buffer.alloc(32))
    .update(sharedSecret.length ? sharedSecret : Buffer.alloc(32))
    .digest()
  return crypto
    .createHmac('sha256', prk)
    .update(Buffer.concat([ephemeralPublicKey, Buffer.from([1])]))
    .digest()
    .subarray(0, 16)
}

const xeapiSign = (timestamp, nonce) => {
  return crypto
    .createHmac('sha256', xeapiSignKey)
    .update(String(timestamp) + nonce)
    .digest('base64')
}

const xeapiMidTransform = (ciphertext) => {
  const random = crypto.randomBytes(16)
  const xored = Buffer.alloc(ciphertext.length)
  for (let i = 0; i < ciphertext.length; i++) {
    xored[i] = ciphertext[i] ^ random[i & 0x0f]
  }
  const b64 = Buffer.from(xored.toString('base64'))
  const rot = b64.length ? (random[0] & 0x0f) % b64.length : 0
  return Buffer.concat([random, b64.subarray(rot), b64.subarray(0, rot)])
}

const xeapiEncryptS = (dynamicKey, publicKeyState, os) => {
  const peerRaw = Buffer.from(publicKeyState.publicKey, 'base64')
  const peerKey = createX25519PublicKey(peerRaw)
  const { publicKey, privateKey } = crypto.generateKeyPairSync('x25519')
  const ephemeralRaw = Buffer.from(
    publicKey.export({ format: 'der', type: 'spki' }),
  ).subarray(-32)
  const sharedSecret = crypto.diffieHellman({
    privateKey,
    publicKey: peerKey,
  })
  const aesKey = deriveX25519AesKey(sharedSecret, ephemeralRaw)
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-128-gcm', aesKey, iv)
  const plaintext = Buffer.from(
    `${dynamicKey.toString('base64')}|${os}|${publicKeyState.sk || ''}`,
  )
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()])
  return Buffer.concat([ephemeralRaw, iv, encrypted, cipher.getAuthTag()])
}

const buildXeapiPlaintext = (uri, data, options = {}) => {
  const fields = {}
  const contentType =
    options.contentType || 'application/x-www-form-urlencoded;charset=utf-8'
  const mediaType = contentType.split(';', 1)[0].toLowerCase()
  if (mediaType !== 'application/x-www-form-urlencoded') {
    fields.contentType = contentType
  }

  const method = (options.method || 'POST').toUpperCase()
  if (method !== 'POST') fields.method = method

  const url = new URL(uri, 'https://interface.music.163.com')
  if (url.search) fields.queryString = url.search.slice(1)

  if (data !== undefined && data !== null) {
    const bodyData = { ...data }
    delete bodyData.e_r
    const body = Buffer.from(new URLSearchParams(bodyData).toString())
    fields.body = body.toString('base64')
  }

  if (fields.queryString) {
    fields.queryString += '&e_r=true'
  } else {
    fields.queryString = 'e_r=true'
  }
  return JSON.stringify(fields)
}

const xeapi = (uri, data, options = {}) => {
  const publicKeyState = options.publicKeyState
  if (!publicKeyState) {
    throw new Error('xeapi publicKeyState is required')
  }
  const activeSessionKey = options.sessionKey
    ? Buffer.from(String(options.sessionKey))
    : null
  const activeSessionId = options.sessionId || ''
  const dynamicKey = activeSessionKey || crypto.randomBytes(16)
  const plaintext = Buffer.from(buildXeapiPlaintext(uri, data, options))

  const b = aesEcbEncrypt(
    dynamicKey,
    xeapiMidTransform(aesEcbEncrypt(xeapiStaticKey, plaintext)),
  )
  const s = xeapiEncryptS(dynamicKey, publicKeyState, options.os || 'android')
  const r = aesEcbEncrypt(
    xeapiStaticKey,
    Buffer.from(
      `${publicKeyState.version}|${activeSessionKey ? activeSessionId : ''}`,
    ),
  )

  return {
    B: b.toString('base64'),
    S: s.toString('base64'),
    R: r.toString('base64'),
  }
}

const xeapiResDecrypt = (body) => {
  const decrypted = aesEcbDecrypt(eapiKey, body)
  const plaintext =
    decrypted[0] === 0x1f && decrypted[1] === 0x8b
      ? zlib.gunzipSync(decrypted)
      : decrypted
  return JSON.parse(plaintext.toString())
}

const xeapiDecryptPublicKey = (encryptedData) => {
  return JSON.parse(
    aesEcbDecrypt(
      xeapiStaticKey,
      Buffer.from(encryptedData, 'base64'),
    ).toString(),
  )
}

module.exports = {
  weapi,
  linuxapi,
  eapi,
  xeapi,
  decrypt,
  aesEncrypt,
  aesDecrypt,
  eapiReqDecrypt,
  eapiResDecrypt,
  xeapiSign,
  xeapiResDecrypt,
  xeapiDecryptPublicKey,
}

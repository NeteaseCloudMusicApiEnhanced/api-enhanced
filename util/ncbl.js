// NCBL 加密工具 —— 复制自 @netease-report-listen-song
// 提供 ChaCha20 / RSA-256 / NCBL 加密 / PLV+PLD 构建 / 设备上下文提取

const crypto = require('crypto')
const zlib = require('zlib')
const axios = require('axios')
const { APP_CONF } = require('./config.json')
const DOMAIN3 = APP_CONF.clDomian3

// ---- ChaCha20 纯 JS 实现 ----
const SIGMA = [0x61707865, 0x3320646e, 0x79622d32, 0x6b206574]

const rotl = (x, n) => ((x << n) | (x >>> (32 - n))) >>> 0

const quarterRound = (s, a, b, c, d) => {
  s[a] = (s[a] + s[b]) >>> 0
  s[d] ^= s[a]
  s[d] = rotl(s[d], 16)
  s[c] = (s[c] + s[d]) >>> 0
  s[b] ^= s[c]
  s[b] = rotl(s[b], 12)
  s[a] = (s[a] + s[b]) >>> 0
  s[d] ^= s[a]
  s[d] = rotl(s[d], 8)
  s[c] = (s[c] + s[d]) >>> 0
  s[b] ^= s[c]
  s[b] = rotl(s[b], 7)
}

const chachaBlock = (key, counter, nonce) => {
  const state = new Uint32Array(16)
  state[0] = SIGMA[0]
  state[1] = SIGMA[1]
  state[2] = SIGMA[2]
  state[3] = SIGMA[3]
  for (let i = 0; i < 8; i++) state[4 + i] = key.readUInt32LE(i * 4)
  state[12] = counter >>> 0
  state[13] = nonce.readUInt32LE(0)
  state[14] = nonce.readUInt32LE(4)
  state[15] = nonce.readUInt32LE(8)

  const work = state.slice()
  for (let i = 0; i < 10; i++) {
    quarterRound(work, 0, 4, 8, 12)
    quarterRound(work, 1, 5, 9, 13)
    quarterRound(work, 2, 6, 10, 14)
    quarterRound(work, 3, 7, 11, 15)
    quarterRound(work, 0, 5, 10, 15)
    quarterRound(work, 1, 6, 11, 12)
    quarterRound(work, 2, 7, 8, 13)
    quarterRound(work, 3, 4, 9, 14)
  }

  const out = Buffer.allocUnsafe(64)
  for (let i = 0; i < 16; i++)
    out.writeUInt32LE((work[i] + state[i]) >>> 0, i * 4)
  return out
}

const chacha20 = (key, counter, nonce, data) => {
  const out = Buffer.allocUnsafe(data.length)
  for (let off = 0; off < data.length; off += 64) {
    const ks = chachaBlock(key, (counter + (off >>> 6)) >>> 0, nonce)
    const end = Math.min(off + 64, data.length)
    for (let i = off; i < end; i++) out[i] = data[i] ^ ks[i - off]
  }
  return out
}

// ---- RSA-256 Key Wrap (网易 NCBL 专用) ----
// 256-bit 模数 N 已被因式分解，故可直接计算私钥
const RSA_N =
  0xfd90bd466ff9bc8a3fec2fbcf263b90d5c564879fa5d7aab89b31c1d5cb4139dn
const RSA_E = 65537n

const beToBig = (buf) => {
  let n = 0n
  for (const b of buf) n = (n << 8n) | BigInt(b)
  return n
}

const bigToBe = (n, len) => {
  const out = Buffer.alloc(len)
  for (let i = len - 1; i >= 0; i--) {
    out[i] = Number(n & 0xffn)
    n >>= 8n
  }
  return out
}

const modPow = (base, exp, mod) => {
  let result = 1n
  base %= mod
  while (exp > 0n) {
    if (exp & 1n) result = (result * base) % mod
    base = (base * base) % mod
    exp >>= 1n
  }
  return result
}

const rsaWrap = (keyA) => {
  return bigToBe(modPow(beToBig(keyA), RSA_E, RSA_N), 32)
}

// ---- NCBL 加密格式 ----
const MAGIC = Buffer.from('NCBL', 'ascii')
const NCBL_VERSION = 3
const HEADER_FIXED_LEN = 70
const META_BLOCK_TYPE = 0x4343
const DEFAULT_MAX_FRAME = 0x8000

const getCompress = () => {
  if (typeof zlib.zstdCompressSync === 'function') {
    return { compress: (buf) => zlib.zstdCompressSync(buf), name: 'zstd' }
  }
  return { compress: (buf) => zlib.gzipSync(buf), name: 'gzip' }
}

const encryptNCBL = (meta, body, opts = {}) => {
  const metaBuf = Buffer.isBuffer(meta) ? meta : Buffer.from(meta, 'utf-8')
  const bodyBuf = Buffer.isBuffer(body) ? body : Buffer.from(body, 'utf-8')
  const maxFrame = opts.maxFrame || DEFAULT_MAX_FRAME

  const keyA = opts.keyA || crypto.randomBytes(32)
  if (keyA[0] >= 0xa3) keyA[0] = 0xa2

  const keyB = rsaWrap(keyA)

  const uuid = opts.uuid || crypto.randomBytes(16)
  if (!opts.uuid) {
    uuid[6] = (uuid[6] & 0x0f) | 0x40
    uuid[8] = (uuid[8] & 0x3f) | 0x80
  }
  const nonce = uuid.subarray(0, 12)
  const counter = uuid.readUInt32LE(12) >>> 2
  const baseSeq = opts.baseSeq || crypto.randomBytes(2).readUInt16LE(0)

  const metaCipher = chacha20(keyB, counter, nonce, metaBuf)
  const metaBlock = Buffer.concat([
    (() => {
      const h = Buffer.allocUnsafe(4)
      h.writeUInt16LE(META_BLOCK_TYPE, 0)
      h.writeUInt16LE(metaCipher.length, 2)
      return h
    })(),
    metaCipher,
  ])
  const headerLen = HEADER_FIXED_LEN + metaBlock.length

  const { compress } = getCompress()
  const compressed = compress(bodyBuf)

  const frames = []
  let seq = baseSeq
  for (let off = 0; off < compressed.length || off === 0; off += maxFrame) {
    const slice = compressed.subarray(off, off + maxFrame)
    const cipher = chacha20(keyA, counter, nonce, slice)
    const head = Buffer.allocUnsafe(6)
    head.writeUInt16LE(cipher.length, 0)
    head.writeUInt32LE(seq >>> 0, 2)
    frames.push(head, cipher)
    seq++
    if (compressed.length === 0) break
  }

  const trailing = Buffer.concat(frames)
  const frameCount = seq - baseSeq

  const header = Buffer.alloc(HEADER_FIXED_LEN)
  MAGIC.copy(header, 0)
  header.writeUInt32LE(NCBL_VERSION, 4)
  header.writeUInt16LE(headerLen, 8)
  uuid.copy(header, 10)
  keyB.copy(header, 26)
  header.writeUInt32LE(baseSeq >>> 0, 58)
  header.writeUInt32LE((baseSeq + frameCount - 1) >>> 0, 62)
  header.writeUInt32LE(trailing.length, 66)

  return Buffer.concat([header, metaBlock, trailing])
}

// ---- 日志记录格式 ----
const FIELD_SEP = '\x01'

const buildRecord = ({ time, action, data }) => {
  const json = typeof data === 'string' ? data : JSON.stringify(data)
  return [time, action, json].join(FIELD_SEP)
}

const buildRecords = (records) => records.map(buildRecord).join('')

// ---- PLV / PLD 构建器 (桌面客户端格式) ----
const buildPlv = (ctx, song, source) => {
  const now = Date.now()
  const addRefer = `[F:63][${now}#933#${ctx.app.version}#${ctx.app.versionCode}#c9156c3][e][2][23][cell_pc_songlist_song:2|page_pc_songlist_songflow|page_mine_like_music][${song.id}:song:x:x|:::|${source.id}:list::]`
  const multiRefers = [
    '[F:26][s][18][_ai]',
    '[F:26][s][12][_ai]',
    `[F:63][${now}#933#${ctx.app.version}#${ctx.app.versionCode}#c9156c3][e][2][8][cell_pc_main_tab_entrance:6|page_pc_main_tab][我喜欢的音乐:spm::|:::]`,
    '[F:26][s][5][_ai]',
    '[F:26][s][0][_ai]',
  ]

  return {
    mode: 'circulation',
    download: 0,
    alg: '',
    status: 'front',
    id: String(song.id),
    bitrate: song.bitrate,
    type: 'song',
    is_listentogether: 0,
    source: source.name,
    is_heart: 0,
    resource_ratio: '',
    resource_time: song.time,
    musiceffect_id: '',
    app_mode: 2,
    bitrate_level: song.level,
    _addrefer: addRefer,
    _multirefers: multiRefers,
    vipType: ctx.auth.vipType,
    fee: 1,
    file: 4,
    rightSource: 0,
    sourceId: source.id,
    sourcetype: source.type,
    libra_abt: '',
    channel: ctx.app.channel,
    curStartChannel: '',
  }
}

const buildPld = (ctx, song, source, played) => {
  const now = Date.now()
  const addRefer = `[F:63][${now}#616#${ctx.app.version}#${ctx.app.versionCode}#c9156c3][e][2][92][btn_pc_cover_play|cell_pc_songlist_song:6|page_pc_songlist_songflow|page_mine_like_music][:::|${song.id}:song:x:x|:::|${source.id}:list::]`
  const multiRefers = [
    '[F:26][s][87][_ai]',
    '[F:26][s][81][_ai]',
    '[F:26][s][75][_ai]',
    '[F:26][s][69][_ai]',
    '[F:26][s][63][_ai]',
  ]

  return {
    mode: 'circulation',
    download: 0,
    alg: '',
    status: 'front',
    id: String(song.id),
    time: played,
    type: 'song',
    is_listentogether: 0,
    source: source.name,
    is_heart: 0,
    realtime: played,
    resource_ratio: '',
    resource_time: song.time,
    musiceffect_id: '1001',
    app_mode: 1,
    lyriceffect: 'default',
    displayMode: 'classic',
    bitrate: song.bitrate,
    bitrate_level: song.level,
    _addrefer: addRefer,
    _multirefers: multiRefers,
    vipType: ctx.auth.vipType,
    fee: 8,
    file: 4,
    rightSource: 0,
    sourceId: source.id,
    sourcetype: source.type,
    end: 'interrupt',
    libra_abt: '',
    channel: ctx.app.channel,
    curStartChannel: '',
  }
}

// ---- Cookie → 设备/认证上下文 转换 ----
const extractContext = (cookieObj) => {
  return {
    app: {
      id: cookieObj.appid || '',
      urs: '',
      pid: '',
      nsm: cookieObj.WEVNSM || '1.0.0',
      cid:
        cookieObj.WNMCID ||
        `${crypto.randomBytes(3).toString('hex')}.${Date.now()}.01.0`,
      channel: cookieObj.channel || 'netease',
      version: cookieObj.appver || '3.1.35',
      versionCode: cookieObj.versioncode || '205293',
      buildCode: cookieObj.buildver || '',
      buildType: 'release',
      packageId: '',
    },
    device: {
      id: cookieObj.deviceId || cookieObj.sDeviceId || '',
      ti: cookieObj.NMTID || '',
      sign: cookieObj.clientSign || '',
      model: cookieObj.mode || cookieObj.mobilename || '',
      nnid: cookieObj._ntes_nnid || ',',
      nuid: cookieObj._ntes_nuid || '',
      csrf: cookieObj.__csrf || '',
      systemType: cookieObj.os || 'pc',
      systemVersion:
        cookieObj.osver ||
        'Microsoft-Windows-10-Professional-build-19045-64bit',
    },
    auth: {
      id: cookieObj.uid || '',
      token: cookieObj.MUSIC_U || '',
      sessionId: cookieObj['JSESSIONID-WYYY'] || '',
      vipType: cookieObj.vipType || '',
    },
    startTime: Date.now(),
    processId: Math.floor(Math.random() * 90000) + 10000,
  }
}

// 从 query.cookie 解析 cookie 对象
// 支持字符串 ("key=val; key2=val2") 或已解析的对象
// 注意：不做 URL decode！MUSIC_U 中的 '+' 会被 decodeURIComponent 错误地转为空格
const parseCookie = (cookie) => {
  if (typeof cookie === 'object' && cookie !== null) return cookie
  if (typeof cookie === 'string') {
    const obj = {}
    cookie.split(';').forEach((part) => {
      const idx = part.indexOf('=')
      if (idx > 0) {
        const key = part.substring(0, idx).trim()
        const val = part.substring(idx + 1).trim()
        if (key) obj[key] = val
      }
    })
    return obj
  }
  return {}
}

// ---- 辅助函数 ----
const randomUUID = () => {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '')
  }
  return 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'.replace(/x/g, () =>
    Math.floor(Math.random() * 16).toString(16),
  )
}

const randomHex = (len) => crypto.randomBytes(len / 2).toString('hex')

// ---- HTTP 上传工具 (NCBL 专用) ----
const buildMultipart = (payload) => {
  const boundary = randomUUID()
  const fileName = `op_${Math.floor(Math.random() * 90000) + 10000}_0_${Math.floor(Math.random() * 4294967295) + 1}`

  const CRLF = '\r\n'
  const headerLines = [
    `--${boundary}`,
    `Content-Disposition: form-data; name="file"; filename="${fileName}"`,
    'Content-Type: multipart/form-data',
    '',
    '',
  ].join(CRLF)
  const footer = `${CRLF}--${boundary}--${CRLF}`

  return {
    boundary,
    fileName,
    multipartBody: Buffer.concat([
      Buffer.from(headerLines, 'utf-8'),
      payload,
      Buffer.from(footer, 'utf-8'),
    ]),
  }
}

const buildCookieStr = (ctx) => {
  const parts = [
    `JSESSIONID-WYYY=${ctx.auth.sessionId}`,
    `MUSIC_U=${ctx.auth.token}`,
    `NMTID=${ctx.device.ti}`,
    `WEVNSM=${ctx.app.nsm}`,
    `WNMCID=${ctx.app.cid}`,
    `__csrf=${ctx.device.csrf}`,
    `__remember_me=true`,
    `_iuqxldmzr_=33`,
    `_ntes_nnid=${ctx.device.nnid}`,
    `_ntes_nuid=${ctx.device.nuid}`,
    `appver=${ctx.app.version}.${ctx.app.versionCode}`,
    `channel=${ctx.app.channel}`,
    `clientSign=${ctx.device.sign}`,
    `deviceId=${ctx.device.id}`,
    `mode=${ctx.device.model}`,
    `ntes_kaola_ad=1`,
    `os=${ctx.device.systemType}`,
    `osver=${ctx.device.systemVersion}`,
  ]
  return parts.join('; ')
}

const buildMetaJson = (ctx) =>
  JSON.stringify({
    'JSESSIONID-WYYY': ctx.auth.sessionId,
    MUSIC_U: ctx.auth.token,
    NMTID: ctx.device.ti,
    WEVNSM: ctx.app.nsm,
    WNMCID: ctx.app.cid,
    __csrf: ctx.device.csrf,
    _iuqxldmzr_: '33',
    _ntes_nnid: ctx.device.nnid,
    _ntes_nuid: ctx.device.nuid,
    appver: `${ctx.app.version}.${ctx.app.versionCode}`,
    channel: ctx.app.channel,
    clientSign: ctx.device.sign,
    deviceId: ctx.device.id,
    mode: ctx.device.model,
    ntes_kaola_ad: '1',
    os: ctx.device.systemType,
    osver: ctx.device.systemVersion,
  })

const doUpload = async (ctx, metaJson, body, cookieStr, label) => {
  const uploadUrl = DOMAIN3 + '/api/clientlog/encrypt/upload?multiupload=true'

  const payload = encryptNCBL(metaJson, body)
  const { boundary, fileName, multipartBody } = buildMultipart(payload)

  const resp = await axios({
    method: 'POST',
    url: uploadUrl,
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      Referer: 'https://music.163.com/di',
      'User-Agent': `Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Safari/537.36 Chrome/91.0.4472.164 NeteaseMusicDesktop/${ctx.app.version}`,
      'Accept-Encoding': 'gzip,deflate',
      'Accept-Language': 'zh-CN,zh;q=0.8',
      Cookie: cookieStr,
    },
    data: multipartBody,
    maxBodyLength: 10 * 1024 * 1024,
    timeout: 15000,
    validateStatus: () => true,
  })

  const respBody = resp.data
  const code = respBody?.code
  const success =
    code === 200 && respBody?.data?.successfiles?.includes?.(fileName)

  return { success, fileName, payload, respBody }
}

// ---- 导出 ----
module.exports = {
  chacha20,
  rsaWrap,
  encryptNCBL,
  getCompress,
  MAGIC,
  NCBL_VERSION,
  HEADER_FIXED_LEN,
  META_BLOCK_TYPE,
  DEFAULT_MAX_FRAME,
  buildRecord,
  buildRecords,
  FIELD_SEP,
  buildPlv,
  buildPld,
  extractContext,
  parseCookie,
  randomUUID,
  randomHex,
  buildMultipart,
  buildCookieStr,
  buildMetaJson,
  doUpload,
}

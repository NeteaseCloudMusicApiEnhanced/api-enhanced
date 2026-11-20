// Minimal client for the music mini NIM link used by the official multi-listen
// matching flow. It only listens for custom notifications (service 7/3); it is
// intentionally independent of the public HTTP API.
const net = require('net')
const {
  constants,
  createPublicKey,
  publicEncrypt,
  randomBytes,
  randomUUID,
} = require('crypto')
const { inflateSync } = require('zlib')
const { EventEmitter } = require('events')

const APP_KEY = '688ebe2a6a7da3d1125936d9ee8b0966'
const PUBLIC_KEY = createPublicKey({
  key: Buffer.from(
    'MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCBxLuL8+xpQSddSnSvPkvNOHdcr5Euqw+kkOSzO/buDMheCfFILRC/v5+nv8BsL7/YZWVpDA8sIBTxfNRqSCu0uLjlbJqT/sMnPT1xxdQrkb1HSnuSyTbZbqaInQ13tBE2SfcAhsQZJJ1hKQSE2QyKOMxQPhP583qcsIhDbdExvwIDAQAB',
    'base64',
  ),
  format: 'der',
  type: 'spki',
})
const MAX_FRAME = 1024 * 1024

function varint(value) {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_FRAME)
    throw new Error('mini NIM frame length invalid')
  const bytes = []
  do {
    const byte = value % 128
    value = Math.floor(value / 128)
    bytes.push(byte | (value ? 128 : 0))
  } while (value)
  return Buffer.from(bytes)
}

function readVarint(bytes, start = 0) {
  let value = 0
  for (let i = 0; i < 4; i++) {
    if (start + i >= bytes.length) return null
    const byte = bytes[start + i]
    value += (byte & 127) * 2 ** (7 * i)
    if (value > MAX_FRAME) throw new Error('mini NIM frame too large')
    if (!(byte & 128)) return [value, start + i + 1]
  }
  throw new Error('mini NIM varint invalid')
}

function properties(fields) {
  const entries = Object.entries(fields).sort(
    ([a], [b]) => Number(a) - Number(b),
  )
  return Buffer.concat([
    varint(entries.length),
    ...entries.flatMap(([key, value]) => {
      const bytes = Buffer.isBuffer(value) ? value : Buffer.from(String(value))
      return [varint(Number(key)), varint(bytes.length), bytes]
    }),
  ])
}

function readProperties(bytes) {
  let position = 0
  const number = () => {
    const result = readVarint(bytes, position)
    if (!result) throw new Error('mini NIM properties incomplete')
    position = result[1]
    return result[0]
  }
  const count = number()
  const result = new Map()
  if (count > 256) throw new Error('mini NIM properties too many')
  for (let i = 0; i < count; i++) {
    const key = number()
    const length = number()
    if (position + length > bytes.length || result.has(key))
      throw new Error('mini NIM properties invalid')
    result.set(
      key,
      bytes.subarray(position, position + length).toString('utf8'),
    )
    position += length
  }
  if (position !== bytes.length)
    throw new Error('mini NIM properties length mismatch')
  return result
}

function frame(service, command, serial, body = Buffer.alloc(0)) {
  const header = Buffer.alloc(5)
  header[0] = service
  header[1] = command
  header.writeUInt16LE(serial, 2)
  return Buffer.concat([varint(header.length + body.length), header, body])
}

function streamCipher(key) {
  if (!key.length) throw new Error('mini NIM key invalid')
  const state = Uint8Array.from({ length: 256 }, (_, i) => i)
  let j = 0
  for (let i = 0; i < 256; i++) {
    j = (j + state[i] + key[i % key.length]) & 255
    ;[state[i], state[j]] = [state[j], state[i]]
  }
  let i = 0
  j = 0
  return (bytes) => {
    const result = Buffer.alloc(bytes.length)
    for (let p = 0; p < bytes.length; p++) {
      i = (i + 1) & 255
      j = (j + state[i]) & 255
      ;[state[i], state[j]] = [state[j], state[i]]
      result[p] = bytes[p] ^ state[(state[i] + state[j]) & 255]
    }
    return result
  }
}

class FrameReader {
  constructor() {
    this.pending = Buffer.alloc(0)
  }

  push(bytes) {
    if (this.pending.length + bytes.length > MAX_FRAME + 4)
      throw new Error('mini NIM frame too large')
    this.pending = Buffer.concat([this.pending, bytes])
    const frames = []
    while (this.pending.length) {
      const length = readVarint(this.pending)
      if (!length) break
      const [size, start] = length
      if (size < 5) throw new Error('mini NIM frame invalid')
      if (this.pending.length < start + size) break
      frames.push(this.pending.subarray(start, start + size))
      this.pending = this.pending.subarray(start + size)
    }
    return frames
  }
}

function packet(bytes) {
  if (bytes.length < 5) throw new Error('mini NIM packet incomplete')
  const flags = bytes[4]
  const offset = flags & 2 ? 7 : 5
  if (bytes.length < offset) throw new Error('mini NIM packet incomplete')
  let body = bytes.subarray(offset)
  if (flags & 1) {
    if (body.length < 4) throw new Error('mini NIM packet invalid')
    const expected = body.readUInt32LE(0)
    if (expected > MAX_FRAME) throw new Error('mini NIM packet too large')
    body = inflateSync(body.subarray(4), { maxOutputLength: MAX_FRAME })
    if (body.length !== expected)
      throw new Error('mini NIM packet length mismatch')
  }
  return {
    service: bytes[0],
    command: bytes[1],
    status: flags & 2 ? bytes.readUInt16LE(5) : 200,
    body,
  }
}

function embedded(bytes, serial = 1) {
  if (bytes.length < 9) throw new Error('mini NIM envelope incomplete')
  const length = readVarint(bytes, 8)
  if (!length) throw new Error('mini NIM envelope incomplete')
  const inner = bytes.subarray(length[1])
  const parsed = packet(inner)
  const header = Buffer.from(
    bytes.subarray(8, length[1] + (inner[4] & 2 ? 7 : 5)),
  )
  header.writeUInt16LE(serial, length[1] - 8 + 2)
  return { id: bytes.subarray(0, 8), header, packet: parsed }
}

/**
 * Emits `notice` ({ timestamp, content }) for every custom notification and
 * `closed`/`error` for lifecycle changes. Call start() once, close() to stop.
 */
class MiniNim extends EventEmitter {
  constructor(options = {}) {
    super()
    this.options = options
    this.socket = null
    this.ended = false
    this.authenticated = false
    this.serial = 2
    this.seen = new Set()
    this.heartbeat = null
    this.timeout = null
    this.rejectLogin = null
    this.lastReceived = Date.now()
    this.timeoutMs = Number(options.timeoutMs) || 20000
  }

  start(credentials) {
    if (this.socket || this.ended)
      return Promise.reject(new Error('mini NIM already started'))
    const { accId, token } = credentials || {}
    if (
      typeof accId !== 'string' ||
      !accId ||
      typeof token !== 'string' ||
      !token
    )
      return Promise.reject(new Error('mini NIM credentials invalid'))

    const key = randomBytes(16)
    const encrypt = streamCipher(key)
    const decrypt = streamCipher(key)
    this.encrypt = encrypt
    this.reader = new FrameReader()
    let login = frame(
      2,
      2,
      this.nextSerial(),
      properties({
        3: 64,
        6: 6,
        8: 0,
        9: 1,
        18: APP_KEY,
        19: accId.toLowerCase(),
        25: 'api-enhanced',
        26: randomUUID(),
        1000: token,
      }),
    )
    const plaintext = Buffer.concat([properties({ 0: key }), login])
    const encrypted = []
    for (let offset = 0; offset < plaintext.length; offset += 117)
      encrypted.push(
        publicEncrypt(
          { key: PUBLIC_KEY, padding: constants.RSA_PKCS1_PADDING },
          plaintext.subarray(offset, offset + 117),
        ),
      )
    plaintext.fill(0)
    key.fill(0)
    const handshake = frame(
      1,
      5,
      1,
      Buffer.concat([
        properties({
          0: 6,
          1: 0,
          2: 0,
          3: 1,
          4: 1,
          7: 0,
          8: APP_KEY,
        }),
        ...encrypted,
      ]),
    )

    return new Promise((resolve, reject) => {
      this.rejectLogin = reject
      const socket = (this.socket = net.connect({
        host: 'link-music-main.netease.im',
        port: 8080,
      }))
      const stop = (message) => {
        login.fill(0)
        login = null
        this.close(message)
      }
      const send = (service, command, body) => {
        if (!this.ended && this.socket)
          this.socket.write(
            encrypt(frame(service, command, this.nextSerial(), body)),
          )
      }
      this.send = send
      const receive = (value, depth = 0) => {
        if (depth > 4) return
        if (value.service === 1 && value.command === 5) {
          if (value.status !== 200 || !login)
            throw new Error(`mini NIM 握手失败（${value.status}）`)
          socket.write(encrypt(login))
          login.fill(0)
          login = null
        } else if (value.service === 2 && value.command === 2) {
          if (value.status !== 200)
            throw new Error(`mini NIM 登录失败（${value.status}）`)
          this.authenticated = true
          if (this.timeout) clearTimeout(this.timeout)
          this.timeout = null
          this.rejectLogin = null
          this.lastReceived = Date.now()
          this.startHeartbeat()
          this.emit('connected')
          resolve()
        } else if (value.service === 2 && value.command === 5) {
          throw new Error('mini NIM 连接已在其他设备关闭')
        } else if (
          value.service === 4 &&
          [1, 2, 10, 11].includes(value.command) &&
          this.authenticated
        ) {
          const inner = embedded(value.body, value.command === 2 ? 0 : 1)
          const id = inner.id.toString('hex')
          const deliveryId = inner.id.readBigInt64LE()
          if (
            inner.packet.service === 7 &&
            inner.packet.command === 3 &&
            deliveryId > 0n
          )
            send(4, 3, Buffer.concat([inner.id, inner.header]))
          if (deliveryId <= 0n) {
            receive(inner.packet, depth + 1)
          } else if (!this.seen.has(id)) {
            if (this.seen.size >= 128)
              this.seen.delete(this.seen.values().next().value)
            this.seen.add(id)
            receive(inner.packet, depth + 1)
          }
        } else if (
          value.service === 7 &&
          value.command === 3 &&
          this.authenticated
        ) {
          const fields = readProperties(value.body)
          const timestamp = Number(fields.get(0))
          const content = fields.get(5)
          if (content && Number.isFinite(timestamp) && timestamp > 0)
            this.emit('notice', { timestamp, content })
        }
      }
      socket.setNoDelay(true)
      socket.once('connect', () => {
        if (!this.ended) socket.write(handshake)
      })
      socket.on('data', (bytes) => {
        if (this.ended) return
        try {
          for (const bytesFrame of this.reader.push(
            decrypt(Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes)),
          )) {
            this.lastReceived = Date.now()
            receive(packet(bytesFrame))
          }
        } catch (error) {
          stop(error instanceof Error ? error.message : 'mini NIM 数据无效')
        }
      })
      socket.on('error', () => stop('无法连接网易云 mini NIM，请检查网络'))
      socket.once('close', () => stop('mini NIM 连接已断开'))
      this.timeout = setTimeout(() => stop('连接 mini NIM 超时，请重试'), this.timeoutMs)
      this.timeout.unref()
    })
  }

  nextSerial() {
    const value = this.serial
    this.serial = (this.serial % 998) + 1
    return value
  }

  startHeartbeat() {
    if (this.heartbeat) clearInterval(this.heartbeat)
    this.heartbeat = setInterval(() => {
      if (this.ended || !this.authenticated) return
      if (Date.now() - this.lastReceived > 45000) {
        this.close('mini NIM 心跳超时')
        return
      }
      try {
        this.send(1, 2)
      } catch (error) {}
    }, 10000)
    this.heartbeat.unref()
  }

  close(reason = 'mini NIM closed') {
    if (this.ended) return
    this.ended = true
    if (this.heartbeat) clearInterval(this.heartbeat)
    if (this.timeout) clearTimeout(this.timeout)
    this.heartbeat = null
    this.timeout = null
    this.socket?.destroy()
    this.socket = null
    this.seen.clear()
    const error = this.rejectLogin
    this.rejectLogin = null
    if (error) error(new Error(reason))
    this.emit('closed', reason)
  }
}

module.exports = { MiniNim, readProperties }

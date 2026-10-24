/**
 * 密码登录接入口（express Router）—— 挂到 server.js 的 /api/yidun
 * 加密 / 反作弊 token / eapi header 全部用 SDK 原生 request()，这里只补三件原生没有的状态：
 * 会话 jar、滑块 sca、二阶段 MUSIC_TU。
 * 链路：密码 → 8821 → sca → 8830 → 短信码 + MUSIC_TU → 200
 */
const express = require('express')
const crypto = require('crypto')
const request = require('../util/request')
const sendV1 = require('../module/captcha_sent_v1.js') // 原生发码模块（eapi v1 口）

const router = express.Router()
router.use(express.json({ limit: '512kb' }))

/* PC 客户端 UA；cookie 里的 os/appver/osver 必须同步成 pc（见 UA与OS.md） */
const PC_UA =
  'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Safari/537.36 Chrome/91.0.4472.164 NeteaseMusicDesktop/3.1.29.205117'
const PC_ID = {
  os: 'pc',
  appver: '3.1.17.204416',
  osver: 'Microsoft-Windows-10-Professional-build-19045-64bit',
  channel: 'netease',
}
const SECRETE = 'music_middleuser_pclogin'
const SCA_TTL = 3 * 60e3
const TU_TTL = 10 * 60e3

const jar = new Map() // sid -> cookie 串
const scaMap = new Map() // sid -> { sca, at }
const tuMap = new Map() // sid -> { tu, loginType, at }

const hex = (n) => crypto.randomBytes(n).toString('hex').toUpperCase()
const md5 = (s) => crypto.createHash('md5').update(String(s)).digest('hex')
const pick = (str, key) => (String(str).match(new RegExp('(?:^|;\\s*)' + key + '=([^;]+)')) || [])[1] || ''
const pairs = (str) =>
  String(str || '')
    .split(';')
    .map((s) => {
      const i = s.indexOf('=')
      return i > 0 ? [s.slice(0, i).trim(), s.slice(i + 1).trim()] : null
    })
    .filter(Boolean)

const newSession = () => {
  const now = Date.now()
  return [
    `_ntes_nuid=${hex(16)}`,
    `_ntes_nnid=${hex(16)},${now}`,
    `WNMCID=${hex(3)}.${now}.01.0`,
    'WEVNSM=1.0.0',
    `deviceId=${hex(16)}`,
    ...Object.entries(PC_ID).map(([k, v]) => `${k}=${v}`),
  ].join('; ')
}
const cookieOf = (sid) => {
  if (!jar.has(sid)) jar.set(sid, newSession())
  return jar.get(sid)
}
const merge = (prev, list) => {
  const m = new Map(pairs(prev))
  ;(list || []).forEach((c) => {
    const kv = String(c).split(';')[0]
    const i = kv.indexOf('=')
    if (i > 0) m.set(kv.slice(0, i).trim(), kv.slice(i + 1).trim())
  })
  return [...m].map(([k, v]) => `${k}=${v}`).join('; ')
}

/* 一次 eapi 调用：原生 request 负责加密与 X-antiCheatToken；这里只合并 set-cookie */
async function call(uri, data, sid) {
  let r
  try {
    r = await request(uri, data, { crypto: 'eapi', cookie: cookieOf(sid), ua: PC_UA, checkToken: 'v2' })
  } catch (e) {
    if (!e || !e.body) throw e // status≠200 时 SDK 是 reject({status,body,cookie})
    r = e
  }
  jar.set(sid, merge(cookieOf(sid), r.cookie))
  const body = r.body || {}
  return { code: body.code, msg: body.message || body.msg || '', body, cookie: jar.get(sid) }
}

/* 直接跑一个原生 module（它自己会用 createOption 拼 eapi 参数），只替它带上会话 cookie */
async function callModule(fn, query, sid) {
  let r
  try {
    r = await fn({ ...query, cookie: cookieOf(sid), ua: PC_UA, checkToken: 'v2' }, request)
  } catch (e) {
    if (!e || !e.body) throw e
    r = e
  }
  jar.set(sid, merge(cookieOf(sid), r.cookie))
  const body = r.body || {}
  return { code: body.code ?? r.status, msg: body.message || body.msg || '', body, cookie: jar.get(sid) }
}

const looksLikeValidate = (s) => /^\S{100,}$/.test(String(s || ''))
function takeSca(sid, fromBody) {
  const sca = String(fromBody || '').trim()
  if (sca) {
    if (!looksLikeValidate(sca)) {
      const e = new Error(`sca 不是有效 validate（长度 ${sca.length}，要求 ≥100 且不含空白）`)
      e.code = 'BAD_SCA'
      throw e
    }
    scaMap.set(sid, { sca, at: Date.now() })
    return sca
  }
  const hit = scaMap.get(sid)
  if (hit && Date.now() - hit.at < SCA_TTL) return hit.sca
  scaMap.delete(sid)
  return ''
}
function tuOf(sid) {
  const hit = tuMap.get(sid)
  if (!hit) return null
  if (Date.now() - hit.at > TU_TTL) {
    tuMap.delete(sid)
    return null
  }
  return hit
}
const bad = (res, e) => res.status(e && e.code === 'BAD_SCA' ? 400 : 500).json({ code: e && e.code === 'BAD_SCA' ? 400 : 500, msg: (e && e.message) || String(e) })

/* ① 登录：200 成功 / 8821 要滑块 / 8830 要短信码 */
router.post('/login', async (req, res) => {
  try {
    const { phone, captcha, password, countrycode = '86', sid = 'default' } = req.body || {}
    if (!phone) return res.status(400).json({ code: 400, msg: '缺少 phone' })
    if (!captcha && !password) return res.status(400).json({ code: 400, msg: 'captcha / password 至少填一个' })

    const restart = req.body?.restart === true
    const stage = restart ? null : tuOf(sid)
    const sca = restart ? '' : takeSca(sid, req.body?.sca)
    if (restart) {
      tuMap.delete(sid)
      scaMap.delete(sid)
    }
    const tu = String(req.body?.tu || '') || (stage && stage.tu) || ''
    /* 二阶段待验证却没填码：直接拒，否则一次性 MUSIC_TU 会被白耗 */
    if (tu && !captcha) {
      return res.status(400).json({
        code: 400,
        msg: '该会话正处于二阶段验证，请先填短信验证码再登录',
        hint: 'MUSIC_TU 只能用一次；要放弃二阶段重回密码登录，带 restart:true',
        hasTu: true,
      })
    }

    const data = { type: '1', https: 'true', phone: String(phone), countrycode: String(countrycode), remember: 'true', secrete: SECRETE }
    if (sca) data.secureCaptcha = sca
    if (tu) {
      data.captcha = String(captcha)
      data.MUSIC_TU = tu
    } else if (password) {
      data.password = md5(password)
    } else {
      data.captcha = String(captcha || '')
    }

    const r = await call('/api/w/login/cellphone', data, sid)
    const code = Number(r.code)
    if (code === 8830 && r.body.MUSIC_TU) {
      tuMap.set(sid, { tu: String(r.body.MUSIC_TU), loginType: r.body.loginType || '', at: Date.now() })
    } else if (code === 200) {
      tuMap.delete(sid)
    }
    scaMap.delete(sid) // validate 一次性，发过即作废

    const musicU = pick(r.cookie, 'MUSIC_U')
    const csrf = pick(r.cookie, '__csrf')
    res.json({
      code: r.code,
      msg: r.msg,
      kind: tu ? 'stage2-captcha' : password ? 'password' : 'captcha',
      body: r.body,
      cookie: r.cookie,
      cookieLen: r.cookie.length,
      loginCookie: musicU ? `MUSIC_U=${musicU}` + (csrf ? `; __csrf=${csrf}` : '') : '',
    })
  } catch (e) {
    bad(res, e)
  }
})

/* ② 发码：直接用原生 module/captcha_sent_v1.js，只把会话 cookie 塞给它 */
router.post('/send', async (req, res) => {
  try {
    const { phone, ctcode = '86', sid = 'default' } = req.body || {}
    if (!phone) return res.status(400).json({ code: 400, msg: '缺少 phone' })
    const r = await callModule(sendV1, { phone: String(phone), ctcode: String(ctcode) }, sid)
    res.json({ code: r.code, msg: r.msg, body: r.body, cookie: r.cookie, cookieLen: r.cookie.length })
  } catch (e) {
    bad(res, e)
  }
})

/* ③ 暂存滑块 validate（3 分钟），之后登录可省略 sca */
router.post('/sca', (req, res) => {
  try {
    const { sid = 'default', sca = '' } = req.body || {}
    const v = takeSca(sid, sca)
    if (!v) return res.status(400).json({ code: 400, msg: '缺少 sca（滑块的 validate）' })
    res.json({ code: 200, msg: 'sca 已缓存，3 分钟内登录可省略该字段', len: v.length, ttlSec: SCA_TTL / 1e3 })
  } catch (e) {
    bad(res, e)
  }
})

/* ④ 会话状态 */
router.get('/state', (req, res) => {
  const sid = req.query.sid || ''
  if (!sid) return res.status(400).json({ code: 400, msg: '缺少 sid' })
  const sca = scaMap.get(sid)
  const stage = tuOf(sid)
  const cookie = jar.get(sid) || ''
  const nmtid = pick(cookie, 'NMTID')
  const age = (t) => (t ? Math.round((Date.now() - t) / 1e3) : 0)
  res.json({
    code: 200,
    sid,
    sca: { has: !!sca, len: sca ? sca.sca.length : 0, ageSec: age(sca && sca.at), ttlSec: SCA_TTL / 1e3 },
    stage: { has: !!stage, loginType: (stage && stage.loginType) || '', ageSec: age(stage && stage.at), ttlSec: TU_TTL / 1e3 },
    nmtid: { len: nmtid.length, real: nmtid.length >= 36 },
    cookieKeys: pairs(cookie).map(([k]) => k),
    cookieLen: cookie.length,
  })
})

module.exports = router

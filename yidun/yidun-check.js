const https = require('https')

/* SDK 里现成的 weapi 加密（AES-128-CBC 双层 + RSA） */
const CRYPTO_PATH = process.env.YIDUN_CRYPTO_PATH || '../util/crypto.js' // 相对 yidun/ 目录，指向项目根的 util/crypto.js
let _weapi = null
function weapi(obj) {
  if (!_weapi) _weapi = require(CRYPTO_PATH).weapi
  return _weapi(obj)
}

const CHECK_URL = 'https://st.music.163.com/weapi/frontrisk/verify/check'

/* captchaId 不在服务端响应里，是前端硬编码的 */
const CAPTCHA_ID = {
  40: 'aefd3e6914a546a2a7263b20a5e8304f', // 滑块
  41: 'eb43b69cce7449c1b818b8a291b36f21', // 空格
}

/* 与 cookie 里 os=pc 自洽的 PC 客户端 UA */
const PC_UA = //这里可以用内置写的ua和os的处理。目前这里固定pc
  'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Safari/537.36 Chrome/91.0.4472.164 NeteaseMusicDesktop/3.1.29.205117'

/** 底层 POST（不跟随重定向，只取一次响应） */
function postForm(url, formBody, headers, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(formBody),
          ...headers,
        },
      },
      (res) => {
        let b = ''
        res.setEncoding('utf8')
        res.on('data', (d) => (b += d))
        res.on('end', () =>
          resolve({
            status: res.statusCode,
            setCookie: res.headers['set-cookie'] || [],
            body: b,
          }),
        )
      },
    )
    req.on('error', reject)
    req.setTimeout(timeout, () => req.destroy(new Error('check 请求超时')))
    req.write(formBody)
    req.end()
  })
}

/**
 * 构造 Referer —— 四个参数必须和挑战对象一一对应，缺一个都可能被判无效
 */
function buildReferer(challenge) {
  const q = new URLSearchParams({
    params: JSON.stringify(challenge.params),
    verifyType: String(challenge.verifyType),
    verifyId: String(challenge.verifyId),
    verifyToken: challenge.verifyToken,
  })
  return 'https://st.music.163.com/encrypt-pages?' + q.toString()
}

/**
 * 提交滑块验证
 *
 * @param {object} opts
 * @param {object} opts.challenge  -462 响应里的 data 对象（含 verifyToken / params / verifyType / verifyId）
 * @param {string} opts.validate   浏览器拿到的 validate（形如 CN31_xxxx）
 * @param {string} opts.cookie     触发 -462 时那一套 cookie（必须是同一个会话）
 * @param {string} [opts.captchaId] 覆盖默认 captchaId（一般不用传）
 * @param {string} [opts.ua]        覆盖默认 UA
 * @param {number} [opts.timeout]   超时毫秒
 * @returns {Promise<{ok:boolean, success:boolean, message:string, code:any, status:number, setCookieCount:number, raw:any}>}
 */
async function submitCheck(opts) {
  const {
    challenge,
    validate,
    cookie,
    captchaId,
    ua = PC_UA,
    timeout = 15000,
  } = opts || {}

  /* ---------- 入参校验：早失败比发出去再排查省事 ---------- */
  if (!challenge || !challenge.verifyToken) {
    throw new Error('缺少 challenge（-462 响应里的 data 对象）')
  }
  if (!validate) throw new Error('缺少 validate（浏览器拖完滑块拿到的）')
  if (!cookie) throw new Error('缺少 cookie（必须与触发 -462 时同一个会话）')

  const verifyType = Number(challenge.verifyType)
  const cid = captchaId || CAPTCHA_ID[verifyType] || CAPTCHA_ID[40]

  /* ---------- 明文只有 5 个字段 ---------- */
  const data = {
    token: challenge.verifyToken,
    verifyType, // 数字，不是字符串
    captchaId: cid,
    validate,
    params: JSON.stringify(challenge.params), // ★ 必须序列化一次，不能嵌套
  }

  /* ---------- weapi 加密 → params + encSecKey ---------- */
  const body = new URLSearchParams(weapi(data)).toString()

  const r = await postForm(
    CHECK_URL,
    body,
    {
      Origin: 'https://st.music.163.com',
      Referer: buildReferer(challenge),
      Cookie: cookie,
      'User-Agent': ua,
    },
    timeout,
  )

  let j = null
  try {
    j = JSON.parse(r.body)
  } catch (e) {
    /* 非 JSON，原样带回 */
  }

  return {
    /* code 是字符串 "200"，且失败也是 "200"，所以 ok 只看 data */
    ok: !!(j && j.data === true),
    success: !!(j && j.data === true),
    message: (j && j.message) || r.body.slice(0, 200),
    code: j && j.code,
    status: r.status,
    setCookieCount: r.setCookie.length,
    raw: j || r.body,
  }
}

module.exports = { submitCheck, buildReferer, CAPTCHA_ID, PC_UA, CHECK_URL }

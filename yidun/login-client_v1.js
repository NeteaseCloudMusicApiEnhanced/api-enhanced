/**
 * 密码登录一体化客户端（精简版）—— 滑块 + 校验 + 登录 全在这一层
 * ==========================================================================
 * 页面只需要调 login()，8821/8830 的推进全部在内部完成：
 *   登录 → 8821 → 挂易盾滑块 → validate → 存 sca → 带 secureCaptcha 重试 → 8830
 *   → 调用方发码填码 → 再调一次 login()（自动带 MUSIC_TU）→ 200
 */
import { mountSlide, destroySlide } from './yidun-slider_v1.js'

const API = {
  login: '/api/yidun/login',
  send: '/api/yidun/send',
  sca: '/api/yidun/sca',
  state: '/api/yidun/state',
}

/* 二次验证相关的 code：8821 要滑块，8830 要短信码，8810 是环境级风控（重试基本没用） */
const NEED_SLIDER = [8821, 8810]
const NEED_CAPTCHA = 8830

const newSid = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : 'sid-' + Date.now() + '-' + Math.random().toString(16).slice(2)

async function post(url, body) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  let j
  try {
    j = await r.json()
  } catch (e) {
    j = { code: r.status, msg: '响应不是 JSON' }
  }
  j.http = r.status
  return j
}

/** 挂滑块并拿到 validate；顺手让服务端存一份（刷新后 3 分钟内还能用） */
export async function verifySlider(opts = {}) {
  const {
    sid = newSid(),
    container = '#yidun-cap',
    width = 360,
    onReady,
    onError,
  } = opts

  const validate = await mountSlide(
    { verifyType: 40, verifyId: 2001 },
    {
      container,
      width,
      onReady,
      onError,
    },
  )
  destroySlide() // 拿到就收起来，别占着页面
  await post(API.sca, { sid, sca: validate }).catch(() => {})
  return validate
}

/** 发短信验证码（eapi v1 口） */
export async function sendSms(opts = {}) {
  const { phone, ctcode = '86', sid = newSid(), sca } = opts
  const body = { phone, ctcode, sid }
  if (sca) body.sca = sca
  return post(API.send, body)
}

/** 查会话状态：sca / 二阶段票据 / NMTID */
export async function state(sid) {
  const r = await fetch(API.state + '?sid=' + encodeURIComponent(sid))
  return r.json()
}

/**
 * 登录（自动过滑块）
 * @param {object} o
 *   phone, password?, captcha?, sid?, sca?, restart?, container?, width?,
 *   onStage?(stage, payload)  stage: 'login' | 'slider' | 'slider-ready' | 'retry' | 'need-captcha' | 'done' | 'error'
 * @returns {Promise<object>} 服务端最后一次响应（code 200 / 8830 / 502 …）
 */
export async function login(o = {}) {
  const {
    phone,
    password,
    captcha,
    sid = newSid(),
    sca,
    restart,
    container = '#yidun-cap',
    width = 360,
    onStage,
  } = o
  const say = (stage, payload) => {
    try {
      onStage && onStage(stage, payload)
    } catch (e) {
      /* 回调出错不影响主流程 */
    }
  }

  if (!phone) return { code: 400, msg: '缺少 phone' }
  if (!password && !captcha)
    return { code: 400, msg: 'password / captcha 至少一个' }

  const body = { phone, password, captcha, sid }
  if (sca) body.sca = sca
  if (restart) body.restart = true

  say('login', body)
  let j = await post(API.login, body)

  /* 8821/8810：拉起滑块，拿 validate 后带 secureCaptcha 重试一次 */
  if (NEED_SLIDER.includes(Number(j.code))) {
    say('slider', j)
    let validate
    try {
      validate = await verifySlider({
        sid,
        container,
        width,
        onReady: () => say('slider-ready', {}),
      })
    } catch (e) {
      say('error', e)
      return { code: j.code, msg: '滑块未通过：' + (e && e.message), origin: j }
    }
    say('retry', { sca: validate.length })
    j = await post(API.login, { ...body, sca: validate })
  }

  if (Number(j.code) === NEED_CAPTCHA) say('need-captcha', j)
  if (Number(j.code) === 200) say('done', j)
  return j
}

/** 一句话判断下一步该干嘛，给 UI 用 */
export function nextStep(res) {
  const code = Number(res && res.code)
  if (code === 200) return 'done' // 成功
  if (code === NEED_CAPTCHA) return 'captcha' // 去发码 + 填码
  if (NEED_SLIDER.includes(code)) return 'slider' // 滑块没过（自动流程里一般不会停在这）
  if (code === 400) return 'params' // 入参问题（含 BAD_SCA）
  if (code === 502 || code === 509) return 'credential' // 密码错 / 错误次数超限
  return 'failed'
}

export { newSid, API }
export default { login, sendSms, verifySlider, state, nextStep, newSid, API }

/* 验证类型枚举（来自易盾前端 bundle） */
export const VERIFY_TYPE = {
  SLIDER: 40, // 滑块
  SPACE: 41, // 语义空格
  CAPTCHA: 20, // 图形字符
}

/* captchaId 不在服务端响应里，是前端硬编码的 */
const CAPTCHA_ID = {
  40: 'aefd3e6914a546a2a7263b20a5e8304f', // 滑块-通用
  41: 'eb43b69cce7449c1b818b8a291b36f21', // 空格
}

const SDK_URL = 'https://cstaticdun.126.net/load.min.js'
const DEFAULT_WIDTH = '320px'
const DEFAULT_TIMEOUT = 3 * 60 * 1000 // 3 分钟没人拖就放弃

/* SDK 只加载一次，用 Promise 缓存，避免并发重复插入 script */
let sdkPromise = null
/* 当前挂载的实例（同一个容器不能重复 init，必须先 destroy） */
let current = null

/**
 * 判断一个响应是不是「滑块挑战」
 * @param {object} resp  接口原始响应（已 JSON.parse）
 * @returns {boolean}
 */
export function isSlideChallenge(resp) {
  return !!(
    resp &&
    Number(resp.code) === -462 &&
    resp.data &&
    Number(resp.data.verifyType) === VERIFY_TYPE.SLIDER &&
    resp.data.verifyToken
  )
}

/**
 * 判断是不是任意一种易盾挑战（滑块 / 空格 / 图形）
 * 有些场景 verifyType 不是 40，此时本模块不能处理，但可以据此给出提示。
 */
export function isAnyChallenge(resp) {
  return !!(
    resp &&
    Number(resp.code) === -462 &&
    resp.data &&
    resp.data.verifyType
  )
}

/** 取某个 verifyType 对应的 captchaId */
export function captchaIdOf(verifyType) {
  return CAPTCHA_ID[Number(verifyType)] || CAPTCHA_ID[VERIFY_TYPE.SLIDER]
}

/** 加载易盾 SDK（幂等） */
function loadSdk() {
  if (typeof window !== 'undefined' && window.initNECaptcha)
    return Promise.resolve()
  if (sdkPromise) return sdkPromise

  sdkPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = SDK_URL
    s.async = true
    s.onload = () => {
      if (typeof window.initNECaptcha === 'function') resolve()
      else reject(new Error('易盾脚本已加载，但没有 initNECaptcha'))
    }
    s.onerror = () => {
      sdkPromise = null
      reject(new Error('易盾脚本加载失败（网络或广告拦截）'))
    }
    document.head.appendChild(s)
  })
  return sdkPromise
}

/** 销毁当前实例，清空容器 */
export function destroySlide() {
  if (current) {
    try {
      current.instance && current.instance.destroy && current.instance.destroy()
    } catch (e) {
      /* 忽略 */
    }
    if (current.cleanup) current.cleanup()
    current = null
  }
}

/** 把 container 参数（选择器 / 元素）解析成元素 */
function resolveEl(target) {
  if (!target) return null
  if (typeof target === 'string') return document.querySelector(target)
  return target
}

/**
 * 挂载滑块并等待用户拖动
 *
 * @param {object} challenge  -462 响应里的 data 对象（含 verifyType / verifyToken / params / verifyId）
 * @param {object} [opts]
 * @param {string|Element} [opts.container='#yidun-cap']  滑块容器
 * @param {string}  [opts.width='320px']   宽度，**只认像素**，'100%' 无效
 * @param {string}  [opts.captchaId]       覆盖默认 captchaId（一般不用传）
 * @param {string}  [opts.lang='zh-CN']
 * @param {number}  [opts.timeout=180000]  超时毫秒
 * @param {Function}[opts.onReady]         (instance) => void  组件就绪，可以开始拖
 * @param {Function}[opts.onError]         (err) => void       出错（同时也会 reject）
 * @param {Function}[opts.onCancel]        () => void          超时/被取消
 * @returns {Promise<string>} 成功时 resolve validate 字符串
 */
export function mountSlide(challenge, opts = {}) {
  const {
    container = '#yidun-cap',
    width = DEFAULT_WIDTH,
    captchaId,
    lang = 'zh-CN',
    timeout = DEFAULT_TIMEOUT,
    onReady,
    onError,
    onCancel,
  } = opts

  return new Promise(async (resolve, reject) => {
    let settled = false
    let timer = null

    const finish = (fn, v) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      fn(v)
    }
    const fail = (err) => {
      if (settled) return
      const e =
        err instanceof Error ? err : new Error(String(err || '安全验证失败'))
      try {
        onError && onError(e)
      } catch (_) {
        /* 忽略 */
      }
      /* 失败也要销毁，否则下次同容器 init 会静默失效 */
      destroySlide()
      finish(reject, e)
    }

    try {
      await loadSdk()
    } catch (e) {
      return fail(e)
    }

    const el = resolveEl(container)
    if (!el) return fail(new Error('找不到滑块容器：' + container))

    /* ★ 同一个容器重复 init 会静默失败（不渲染、不回调），必须先销毁 */
    destroySlide()
    el.innerHTML = ''

    /* 内层再包一个 div：易盾会往容器里写自己的节点，外层留给我们清理 */
    const host = document.createElement('div')
    host.id = 'yidun-' + Date.now()
    el.appendChild(host)

    timer = setTimeout(() => {
      try {
        onCancel && onCancel()
      } catch (_) {
        /* 忽略 */
      }
      fail(new Error('安全验证超时，请重试'))
    }, timeout)

    const cid = captchaId || captchaIdOf(challenge && challenge.verifyType)

    /* ---------------------------------------------------------------
           易盾的签名是 initNECaptcha(options, onInit, onError) —— 三个参数。
           ★ onVerify 必须写在第一个 options 里。
             写成 initNECaptcha(opts, { onVerify }) 组件照样能渲染、能拖，
             但 onVerify 永远不触发，界面会卡在「等待验证」且不报错。
           --------------------------------------------------------------- */
    try {
      window.initNECaptcha(
        {
          captchaId: cid,
          element: '#' + host.id,
          mode: 'embed', // 不写默认是独立弹窗
          width, // 只认像素
          lang,

          onVerify: (err, data) => {
            if (err) return fail(err)
            if (!data) return fail(new Error('安全验证未返回结果'))

            /* 不同版本的易盾字段位置略有差异，做兼容 */
            const validate =
              data.validate || (data.data && data.data.validate) || ''

            if (!validate) return fail(new Error('安全验证未通过，请重试'))
            finish(resolve, validate)
          },

          onError: (e) => fail(e || new Error('安全验证组件出错')),
        },
        (instance) => {
          current = {
            instance,
            cleanup: () => {
              try {
                el.innerHTML = ''
              } catch (_) {}
            },
          }
          try {
            onReady && onReady(instance)
          } catch (_) {
            /* 忽略 */
          }
        },
        (e) => {
          fail(e || new Error('安全验证组件初始化失败'))
        },
      )
    } catch (e) {
      fail(e)
    }
  })
}

/**
 * 一步到位：判断 + 挂载 + 交回
 * 响应不是滑块挑战时直接返回 null，方便写成一行。
 *
 * @returns {Promise<string|null>} validate 或 null（无需验证）
 */
export async function handleResponse(resp, opts = {}) {
  if (!isSlideChallenge(resp)) return null
  return mountSlide(resp.data, opts)
}

export default {
  isSlideChallenge,
  isAnyChallenge,
  mountSlide,
  handleResponse,
  destroySlide,
  captchaIdOf,
  VERIFY_TYPE,
}

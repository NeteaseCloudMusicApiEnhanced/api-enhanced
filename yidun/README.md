# 偷懒了喵(^///^)，能看懂怎么用那就很强了。

# yidun-check.js是给旧接口的验证码用的，位置在第十章

# yidun · 网易云密码登录（滑块 + 短信）

> 一条链路：**密码 → `8821` 滑块 → `secureCaptcha` → `8830` → 短信码 + `MUSIC_TU` → `200`**
> 服务端 4 个接口在 `yidun-api.js`，`server.js` 里只挂一行路由。

## 一、目录里有什么

| 文件 | 跑在哪 | 作用 |
|---|---|---|
| `yidun-api.js` | 服务端 | **4 个接口的实现**（express Router）：login / send / sca / state。加密与反作弊 token 全用 SDK 原生 `request()` |
| `login-client_v1.js` | 浏览器 | **一体化客户端**：登录 + 自动拉滑块 + 带 sca 重试 + 状态判断 |
| `yidun-slider_v1.js` | 浏览器 | 易盾滑块底层封装（`mountSlide` / `destroySlide`），被上面那个调 |
| `UA与OS.md` | 文档 | UA/`os` 不一致时怎么判断、怎么处理（只讲方法，不给代码） |
| `yidun-check.js` | 服务端 | `-462` 的 check 转发，**当前链路不用**，见第九节 |

> `server.js` 里只留两行：`app.use('/api/yidun', require('./yidun/yidun-api.js'))` +
> 一行 `/yidun` 静态白名单（只放行浏览器要用的两个 js）。

静态白名单放行后，浏览器直接引：

```
/yidun/login-client_v1.js
/yidun/yidun-slider_v1.js
```

## 二、最少代码跑通

```html
<div id="yidun-cap"></div>          <!-- 滑块要挂的容器 -->
<script type="module">
import { login, sendSms, newSid } from '/yidun/login-client_v1.js'

const sid = newSid()                 // 整个流程共用这一个 sid

// ① 先点登录（不用管 8821，内部会自动拉滑块）
let r = await login({
  phone, password, sid,
  container: '#yidun-cap',
  onStage: (stage, p) => console.log(stage, p),   // 可选，看进度用
})

// ② 返回 8830 说明滑块过了，接下来发短信
if (r.code === 8830) {
  await sendSms({ phone, sid })
  // 用户把收到 6 位码填进来
  r = await login({ phone, captcha: code, sid })   // MUSIC_TU 服务端自动带
}

// ③ 200 成功
if (r.code === 200) console.log('MUSIC_U:', r.loginCookie)
</script>
```

`login()` 内部做的四件事：

```
POST /api/yidun/login            → 8821
  └ 挂滑块（mountSlide）→ 拿 validate
  └ POST /api/yidun/sca          → 存 3 分钟（刷新后还能用）
  └ POST /api/yidun/login + sca  → 8830
```

**页面不用写任何易盾代码**，也不用判断错误码来推进流程。

## 三、客户端 API

### `login(opts)`

| 参数 | 必填 | 说明 |
|---|---|---|
| `phone` | ✅ | 手机号 |
| `password` | 二选一 | 明文，服务端 md5 |
| `captcha` | 二选一 | 二阶段的 6 位短信码 |
| `sid` | 建议 | 会话 id，不传会随机生成（但换 id 就换会话） |
| `sca` | ❌ | 手动指定 validate；一般不用传，内部会拉滑块 |
| `restart` | ❌ | `true` = 放弃二阶段、重新用密码登（会清掉 TU） |
| `container` | ❌ | 滑块容器选择器，默认 `#yidun-cap` |
| `width` | ❌ | 滑块宽度（像素），默认 360 |
| `onStage(stage, payload)` | ❌ | 阶段回调，见下表 |

`onStage` 会收到：

| stage | 什么时候 | payload |
|---|---|---|
| `login` | 第一次提交 | 请求体 |
| `slider` | 收到 8821/8810 | 那次响应（含 `code`/`msg`） |
| `slider-ready` | 滑块渲染完成、可以拖 | `{}` |
| `retry` | 拖完，带着 sca 重试 | `{ sca: 531 }`（validate 长度） |
| `need-captcha` | 收到 8830 | 响应 |
| `done` | 200 | 响应 |
| `error` | 滑块报错/超时/被取消 | `Error` |

返回：服务端最后一次响应（原样），`code` 可能是 `200 / 8830 / 502 / 509 / 400 …`。

### 其它

| 方法 | 说明 |
|---|---|
| `sendSms({ phone, sid, ctcode? })` | 发码（eapi v1 口；`sca` 不使用） |
| `verifySlider({ sid, container?, width?, onReady?, onError? })` | 只挂滑块拿 validate，不登录（可用于自检） |
| `state(sid)` | 查会话：sca 有没有、二阶段票据、NMTID 真假 |
| `nextStep(res)` | 把 `code` 翻成 `'done' \| 'captcha' \| 'slider' \| 'params' \| 'credential' \| 'failed'` |
| `newSid()` | 生成会话 id |

## 四、服务端 4 个接口

### `POST /api/yidun/login`

```jsonc
// 请求
{ "phone": "138…", "password": "明文", "sid": "…" }      // 第一步
{ "phone": "138…", "password": "明文", "sid": "…", "sca": "CN31_…" }   // 滑块后重试
{ "phone": "138…", "captcha": "123456", "sid": "…" }     // 二阶段收尾（不用带 password）
{ "phone": "138…", "password": "明文", "sid": "…", "restart": true }   // 放弃二阶段

// 返回
{ "code": 200, "msg": "…",
  "kind": "password | stage2-captcha | captcha",
  "body": { …网易云原始响应… },
  "cookie": "…", "cookieLen": 262,
  "loginCookie": "MUSIC_U=…; __csrf=…" }   // 只有 200 才有
```
### `POST /api/yidun/send`

```jsonc
{ "phone": "138…", "sid": "…", "ctcode": "86" }
→ { "code": 200, "msg": "…", "cookie": "…" }
```

> 发码可以直接用路由：`/captcha/sent/v1`。

### `POST /api/yidun/sca`

```jsonc
{ "sid": "…", "sca": "CN31_…" }        // 滑块拖完后调一次
→ { "code": 200, "msg": "sca 已缓存，3 分钟内登录可省略该字段", "len": 531, "ttlSec": 180 }
```

### `GET /api/yidun/state?sid=…`

```jsonc
{ "code": 200, "sid": "…",
  "sca":   { "has": false, "len": 0, "ageSec": 0, "ttlSec": 180 },
  "stage": { "has": false, "loginType": "", "ageSec": 0, "ttlSec": 600 },  // has=true 表示正在等短信码
  "nmtid": { "len": 41, "real": true },
  "cookieKeys": ["_ntes_nuid", "…"], "cookieLen": 384 }
```

## 五、错误码

### 走流程会遇到

| code | 含义 | 是终点吗 | 下一步 |
|---|---|---|---|
| `200` | 登录成功 | ✅ | 取 `loginCookie`（含 `MUSIC_U`） |
| `8821` | 需要行为验证码 | ❌ | 拖滑块 → 带 `sca` 重试（`login()` 自动做） |
| `8830` | 需要二阶段验证（body 里有 `MUSIC_TU`） | ❌ | 发短信 → 填码 → 再 `login()` |
| `8810` | 网络环境存在安全风险 | ⚠️ | 换网络/关代理；硬拖滑块也能试，但多半还是 8810 |

### 参数/凭据问题

| code | 含义 | 怎么办 |
|---|---|---|
| `400` | 入参不合法 | 看 `msg`：`缺少 phone` / `captcha 或 password 至少一个` / `sca 不是有效 validate（长度 N，要求 ≥100 且不含空白）` / `该会话正处于二阶段验证，请先填短信验证码` |
| `502` | 账号或密码错误 | 别连试，错误次数会累计 |
| `509` | 密码错误超过限制 | 等冷却（30 分钟~数小时），这期间别试 |
| `406` | 操作频繁 | 发码连点触发，等 60 秒 |
| `503` | 验证码错误 / 不存在 | 重新发码（留了weapi和eapi的发码口） |
| `443` | 验证码不正确 | 同上 |
| `409` | 操作太频繁 | 等一会 |
| `-460` | 网络环境异常 | UA 与 cookie 的 `os/appver/osver` 不自洽（模块已对齐，出现说明环境被改） |
| `-462` | 需要安全验证（weapi（旧验证码口）） | 要用 `yidun-check.js` 这个文件|

### 客户端模块自己抛的

| 情况 | 表现 |
|---|---|
| 滑块超时/被取消/校验失败 | `onStage('error')` + 返回 `{ code: 原code, msg: '滑块未通过：…' }` |
| 缺 `phone` | 直接返回 `{ code: 400, msg: '缺少 phone' }`，不发请求 |
| 服务端没起 / 路由 404 | `{ code: 404, msg: '响应不是 JSON' }` |


1. **可以直接用原生接口**：`/captcha/sent/v1`（eapi）与 `/captcha/sent`（weapi），参数 `phone/ctcode/cookie`；
2. **validate 一次性**：拖完只能用一次，重试第二遍必须重新拖。`login()` 每次都会重新挂。
3. **`MUSIC_TU` 一次性且只有 10 分钟**：没填码就发出去会把它废掉。所以模块和服务端都做了拦截。
4. **两条发码口的码不通用**：eapi v1 的码只配 eapi 登录（本模块只有这条）。
5. **必须同一个 `sid`**：换 sid = 换会话 = TU 和 sca 全丢。
6. **`8821` 没有 `verifyToken`**
7. **未知码**：原样返回
8. **密码错误次数累计**：`502` 别连点，会进 `509`。
9. **滑块容器**：同一个容器重复 init 会静默失败，模块里已经先 `destroySlide()` 再挂。

无示例页

## 八、安全提醒

（这 4 个接口**没有鉴权**。服务如果对外可达，任何人都能拿手机号跑密码登录（错误次数会累计到 `509`），`/api/yidun/state` 还能读到会话里的票据。对外部署前至少加一层 token 或限制在内网。）

## 九、滑块模块 `yidun-slider_v1.js`
浏览器端只干一件事：**把易盾滑块挂出来、让用户拖、把 `validate` 交回来**。提交校验（check）必须后端做，理由见下一节。

### 导出

| 名称 | 作用 |
|---|---|
| `mountSlide(challenge, opts)` | 挂载并等待，`resolve` 出 `validate` 字符串 |
| `handleResponse(resp, opts)` | 判断 + 挂载一步到位；不是滑块挑战时返回 `null` |
| `isSlideChallenge(resp)` / `isAnyChallenge(resp)` | 判断响应里有没有挑战 |
| `captchaIdOf(verifyType)` | `verifyType` → 通用 `captchaId` |
| `destroySlide()` | 销毁当前实例（同容器重新挂之前必须先调） |

### `mountSlide` 参数

| 参数 | 默认 | 说明 |
|---|---|---|
| `container` | `#yidun-cap` | 容器选择器 |
| `width` | `320` | **只认像素** |
| `captchaId` | 按 `verifyType` 推 | 一般不用传 |
| `lang` | `zh-CN` | 语言 |
| `timeout` | 内部默认 | 超时即 reject |
| `onReady(instance)` | — | 组件就绪、可以拖 |
| `onError(err)` | — | 出错（同时也会 reject） |
| `onCancel()` | — | 超时/被取消 |

### 三个必须知道的细节

1. `initNECaptcha(options, onInit, onError)` 是**三参数**，`onVerify` 必须写在第一个 `options` 里；
   写成 `initNECaptcha(opts, { onVerify })` 组件照样能渲染、能拖，但**永远不回调**，界面会卡在「等待验证」。
2. `mode` 不写默认是独立弹窗，内嵌必须 `mode: 'embed'`。
3. 同一个容器重复 `init` 会静默失败（不渲染、不回调），所以模块内部先 `destroySlide()` 再挂。


## 十、`-462` 的 check 模块（`yidun-check.js`）

这是**另一套机制**，和密码登录的 `8821` 无关。
### 它解决什么

weapi 接口（`/weapi/w/login/cellphone`、`/weapi/sms/captcha/sent` 等）返回 `-462` 时会带一个挑战对象：

```jsonc
{ "code": -462, "data": {
  "verifyType": 40,                       // 40 = 滑块
  "verifyId": 2001,                       // 2001=登录 1007602=发码
  "verifyUrl": "https://st.music.163.com/encrypt-pages",
  "verifyToken": "00.40.xxxx.1234567890",
  "params": { "event_id": "…", "sign": "…" } } }
```

用户拖完滑块拿到 `validate` 后，要由**服务端**提交给网易云：
```
POST https://st.music.163.com/weapi/frontrisk/verify/check
```
SDK 没有这个接口的封装,所以单独写了这个模块。



# 必须和触发 `-462` 的那次请求**共用同一个 cookie 会话**，否则 check 白做（响应 Set-Cookie 恒 0 条，状态记在会话上）。

### 用法

```js
const { submitCheck } = require('./yidun-check.js')

const r = await login_cellphone({ phone, captcha, cookie })
if (r.body.code === -462) {
  const challenge = r.body.data              // 整个 data 原样留着
  // 前端渲染滑块 → 拖完带回 validate
  const c = await submitCheck({ challenge, validate, cookie })
  if (c.success) {
    const r2 = await login_cellphone({ phone, captcha, cookie })  // 同一个 cookie 再试
  }
}
```

### 判据

返回体形如 `{"code":"200","message":"验证成功","data":true}`。

> ⚠️ `code` **恒为字符串 `"200"`**（失败时也是），唯一判据是 **`data === true`**。

## 十一、相关文档

| 文件 | 内容 |
|---|---|
| [UA与OS.md](UA与OS.md) | `-460` 类问题：三处身份对照、判断顺序、处理原则、常见误判 |

# 多人一起听 Demo

`/listen_together_multi/` 是 api-enhanced 的多人一起听网页控制台：创建 / 匹配 / 加入房间，跟随房间同步播放，排队推歌、一起听点赞、聊天与表情。

页面是**纯静态零构建**的：Express 直接托管 `public/`，浏览器按顺序执行 classic script，不经过打包器，也不新增 npm 依赖。Vue 3 与 axios 优先从同源 `vendor/` 加载（Cloudflare/浏览器可长期缓存），失败再回退 jsDelivr → unpkg；业务脚本一次性并行下载、按 `async=false` 顺序执行，不再逐个等 `onload`。图标使用 Font Awesome 6 Free（CDN，失败自动降级），依赖全部失败时给出可重试的错误面板而不是白屏。

## 快速开始

```sh
pnpm start            # 或 node app.js，默认 http://localhost:3000
```

- 页面：<http://localhost:3000/listen_together_multi/>
- 登录：页面内置扫码登录，也可先到 `/qrlogin.html` 扫码；服务端配置 `NETEASE_COOKIE` 时可直接复用。
- 旧路径 `/listen_together_multi.html` 仍会重定向到这里。

## 界面预览（无需登录）

| 参数 | 作用 |
| --- | --- |
| `?mock=1` | 注入一套完整的房间数据（成员 / 待播 / 已播 / 聊天 / 歌词），不请求任何接口 |
| `?mock=lobby` | 预览大厅（含「继续加入」卡片） |
| `?mock=chat` | 房间内直接打开聊天分区 |
| `?ui=song\|mylists\|playlists\|collect\|share\|invite\|settings\|debug\|members\|landing\|lyrics\|immersive` | 直接打开对应弹层，便于截图与走查 |
| `?theme=dark\|light\|auto` | 强制主题，不影响已保存的偏好 |

例如 `http://localhost:3000/listen_together_multi/?mock=1&theme=light&ui=lyrics`。

## 功能

**房间**

- 创建私密 / 公开好友房、官方陌生人随机匹配（SSE + ACK）、取消匹配、重新匹配
- 「匹配用歌」必须先选择：未选歌时创建与匹配按钮均不可用
- 分享链接 / 房间号加入，自动解析 `163cn.tv` 与官方 `multishare` 链接；带 `?roomId=&inviterUid=` 打开时先显示邀请预览再确认加入
- 检测到账号仍在房间中时，首页显示「继续加入 / 忽略」，不再直接吞掉用户进入房间
- 在线成员列表：**以 IM 快照为主、HTTP 快照只做补充**，按 uid 合并去重；成员区不再提供误导性的「刷新」
- 在线人数以服务端 `onlineNums` 为准：IM 30005、HTTP 状态、邀请页三路拿到的都是**部分名单**（实测 20 人在线时 30005 每次都只给同样的 6 条，不是分批；邀请页甚至更少）。反编译官方 9.6.05 确认：它同样只有这份列表，UI 只展示最多 5 个头像并把最后一个替换成「+onlineNums」；全仓 `listen/together/*` 路径里没有成员列表接口。界面因此显示「已获取 6 / 20」并说明剩余人数未公开
- 三路名单按 uid 合并：IM 优先，HTTP 与邀请页只补充新成员；邀请页在进房后补拉一次
- 房间类型（公开匹配房 / 关注一起听 / 私密 / 公开好友房 / 特殊房）、权限、加歌冷却倒计时（以服务端 `data.nextAddSongDuration` 为准，心跳/状态持续覆盖）
- 待播队列（全量分页拉取）、UP 顶歌、删除自己的推荐、已播历史分页
- 分享面板：分享链接、房间号、当前歌曲链接，一键复制

**播放**

- 跟随房间心跳与 IM 广播对齐进度，拒绝旧版本状态；暂停只影响本机
- 五档音质（自定义菜单，避免 Firefox 下原生 select 随进度刷新闪烁），自动降级并显示实际音质；音量滚轮 / 静音 / 百分比，静音与音量都会持久化
- 一起听点赞（可重复）与个人红心分离；请求下一首
- **长按红心（桌面端也可右键）收藏到指定歌单**：弹出歌单列表，选择后调用 `playlist/tracks` 入库；普通点击仍是喜欢/取消
- 选歌弹窗分「搜索 / 我的歌单」：我的歌单读取创建与收藏的歌单，进入歌单后分页加载歌曲（100/首），选中即试听；搜索与歌单结果都会保留选中态
- 试听：标准音质、可暂停、**可拖动进度**；试听播放时房间音频自动静音，暂停 / 结束 / 关闭弹窗 / 加歌后恢复（不改动音量偏好）
- 试听音源在关窗后才返回时会自动作废（代际令牌），不会出现「关窗后房间一直静音」的竞态
- 歌词（LRC 解析、翻译行、跟随高亮、手动滚动后「回到当前」）
- 沉浸模式：桌面隐藏三栏放大封面与歌词；移动端隐藏底部标签栏、保留顶栏用于退出，切到聊天会自动退出沉浸
- 歌词跟随当前句：初次定位与会因布局变化重定位时用即时滚动，桌面展开歌词时把空间让给歌词
- Media Session：系统媒体键 / 控制中心可播放、暂停、切歌
- 封面驱动的房间氛围光，深浅两套主题
- 封面 / 头像统一按展示尺寸请求（网易云 `param=WxH`），不再拉整张原图

**聊天**

- 文字、内置一起听表情、网易云自定义表情包、Unicode 表情、颜文字
- 贴纸按 Discord / Ins 的尺寸展示（消息内 140–192px，表情面板 64px 网格）
- 自定义表情可删除：面板里点 × 再点一次确认，会同步移除本地收藏与网易云自定义表情（`/social/emoji/cancel`）
- 歌曲卡片直接加歌；收到的图片表情可一键收藏
- 上拉补更早历史并保持阅读位置；未读分隔；系统通知与互动消息不计入未读
- 滚上去后右下角出现「回到底部」按钮，带未读数，点击回到底部并清空未读
- 草稿按房间保存；100 字上限与计数；`Ctrl/Cmd + Enter` 发送，`Enter` 换行
- `@` 提及成员（完整昵称、光标处插入、消息内高亮）
- 系统 / 互动消息按「文本 + 4 秒窗口」去重，IM 推送与历史回填不会重复出现
- 工作日志页签，支持导出诊断 JSON

**邀请**

- 邀请面板解析官方 `mutual/follows/get/v2` 的真实结构：`mutualFollowLists[{ userInfo, online, inRoom, recommendReasons }]`，群聊取 `multiGroupLists`；按在线优先排序，标记「已在房间中」并展示推荐原因（如「在线」「最近一起听」）

**实时性（IM）**

- 连接 NIM 聊天室后直接消费房间广播：
  - `30000` 播放状态（playSong / playedTime / version / waitSongCount）→ 立即对齐歌曲与进度
  - `30008` 歌曲操作（赞 / 顶 / 红心 / 切歌）→ 更新计数并触发一次权威状态校准
  - `30005` 成员快照 → 成员列表即时刷新，并**跨帧累积**（服务端每次可能只给一个子集；按 uid 去重，15 分钟未见则淘汰，人数上限对齐 `onlineNums`）
  - 聊天室消息 → 直接增量并入列表：普通文本用 body#3；**互动消息**（`serverExt.msgType = 1`，如点赞/顶歌）取 `imChatRoomMsgBody.mainStateText`，按「房间互动」居中展示并带歌曲卡片；只有正文为空（body#3 只有空格）时才忽略，且**不再因此触发历史拉取**
- **IM 连接后停止聊天历史轮询**：聊天消息直接增量并入列表（含 latin1 乱码还原），解析失败才回退一次历史拉取；IM 断开后自动恢复轮询
- 重新匹配 / 退出房间时会先换一代 IM 连接（旧连接的回调全部失效），新房间的 `chatRoomId` 到达后自动重连，不会出现「还在旧聊天室」的情况
- HTTP 轮询（心跳 / 状态）保留为断线兜底，IM 断开不影响可用性

**其他**

- 快捷键：`空格` 播放/暂停、`/` 打开选歌、`M` 静音、`L` 歌词、`Esc` 按视觉层级逐层关闭；有弹层时房间快捷键自动禁用，输入法组合中按 Esc 不会关弹窗
- 加载骨架、空态、Toast；错误统一提示并保留在工作日志里

## 目录结构

```text
index.html                 壳 + 全部 <template id="tpl-*"> 模板
vendor/
  vue.global.prod.js       Vue 3.5.46（同源优先，失败回退 CDN）
  axios.min.js             axios 1.20.0
css/
  tokens.css               设计令牌 / 深浅主题 / 重置
  base.css                 按钮、输入、标签、弹层、Toast、骨架
  layout.css               应用外壳、房间栅格、顶栏、登录、大厅、断点
  player.css               主舞台、歌词、房间信息、沉浸模式
  queue.css                队列、成员、邀请
  chat.css                 消息流、输入区、表情、日志
js/
  boot.js                  依赖加载（同源 vendor → jsDelivr → unpkg）
  core.js                  axios 实例、日志、存储、常量与工具
  stickers.js              内置表情、本地表情读取
  state.js                 共享响应式 store
  computed.js              视图、房间、播放、聊天的派生状态
  methods/
    common.js              复制、刷新、Toast、格式化、诊断导出
    api.js                 统一请求封装与错误类型
    room.js                登录、房间状态、轮询、心跳、操作
    match.js               SSE 匹配、NIM 聊天室
    stickers.js            表情收藏、云表情分页
    songs.js               选歌、搜索分页、音频、音量、音质
    queue.js               待播刷新、已播分页
    chat.js                聊天分页、草稿、@提及、发送
    lyrics.js              歌词拉取与解析
    invite.js              邀请面板、分享落地预览
    ui.js                  主题、沉浸、扫码登录、快捷键、Media Session
  components/
    shell.js               登录、大厅、顶栏、成员、Toast
    room.js                主舞台、队列
    chat.js                聊天、表情面板
    overlays.js            选歌、分享、邀请、设置、调试、落地预览
  mounted.js               挂载：监听、计时、音频、快捷键、启动
  mock.js                  预览数据
  app.js                   组装 store 与根组件
```

组件与根实例共享同一份响应式 store（`data` 返回同一个对象，`computed` / `methods` 同源注入），所以视图之间不需要层层传 props。

## 关键接口

- 状态：`/listentogether/multi/match/status/get`
- 匹配：`/listentogether/multi/match` + SSE `/listentogether/multi/match/events`、`match/ack`、`match/cancel`
- 房间：`multi/room/create`、`match/exit`
- 队列：`match/wait/song/list`、`match/played/song/list`、`match/song/operate`
- 聊天：`match/msg/history`、`multi/chat/send`、`chatroom/token`
- 邀请：`mutual/follows/get/v2`、`multi/invite`
- 歌单：`user/playlist`、`playlist/track/all`、`playlist/tracks`（请求封装会给所有带 `cookie` 的请求自动追加 `mergeCookie=body` 查询参数，合并浏览器 Cookie）
- 落地页：`multi/landing/info`
- 表情：`social/emoji/groups`、`social/emoji/groups/detail/page`、`social/emoji/collect`
- 分享解析：`share/resolve`
- 表情删除：`social/emoji/cancel`

## 开发注意

- `public/` 不在 ESLint 范围内；JS / CSS 已按仓库 Prettier 规则格式化。
- **不要用 Prettier 格式化 `index.html`**：它会把 `{{ ... }}` 里的长表达式折行，把字符串字面量截断成语法错误。模板请手工维护。
- 修改后记得同步 `js/boot.js` 的 `VERSION` 与 `index.html` 里的 `?v=`，避免浏览器缓存旧脚本。
- `app.js` 启动时会检查关键方法（IM 广播处理、聊天增量、音质切换等）是否存在，缺失会写入工作日志并 `console.error`，避免再次出现「方法被误删、只在真实房间才报错」的问题。
- 匹配房需要两名在线用户才能联调；单人请用 `?mock=1` 走查界面，或创建私密房后用第二个浏览器加入。
- 与桌面客户端 `music-party` 相比，本页**未包含**：私信模块、图片 / GIF 上传、歌单 / 专辑 / 歌手浏览、自定义皮肤，以及托盘 / 自动更新等 Electron 专属能力。

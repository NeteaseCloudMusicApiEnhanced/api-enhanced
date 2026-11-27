# 多人一起听 Demo 重构方案

> 目标：**好用 / 好看 / 响应式 / 功能丰富**。
> 约束：零构建（Express 静态托管，`public/` 不参与 lint），接口与后端行为不变，渐进式重构、每阶段可运行。

---

## 1. 现状盘点（基于代码与实机截图）

| 维度 | 现状                                                                                                                       |
| ---- | -------------------------------------------------------------------------------------------------------------------------- |
| 体量 | `index.html` 918 行、`style.css` 1615 行、JS 5591 行                                                                       |
| 结构 | 单文件模板 + 4 个扁平 CSS 区 + 5 个方法文件；`js/methods/room.js` **1101 行**是上帝模块                                    |
| 状态 | 一个 **154 键**的扁平 `data`，轮询 / SSE / IM / 音频 / UI 全混在一起                                                       |
| 样式 | 无设计 token，颜色硬编码（`#333/#999/#c20c0c`）；模板里 **52 处内联 style**；仅 **2 个媒体查询**（600px + reduced-motion） |
| 交互 | `alert()` 打断、**74 处 catch** 大多静默吞错；无 toast / 骨架屏 / 空态插画 / 键盘快捷键                                    |
| 依赖 | Vue 3 + axios 走 `unpkg` / `jsdelivr` CDN——国内网络下 unpkg 经常拿不到，页面直接白屏                                       |

### 1.1 信息架构问题

- 「调试控制台」信息混进主界面：`SongID`、`BizID`、`ChatRoom ID`、`实际音质（已自动降级）`、`权限: 加歌 ✅ | 切歌 ✅`、`强制重置状态`。
- 未登录时主页几乎是**空白**（截图 1440×1000 只有两行字 + 一个按钮），没有登录引导，只有跳去 `/qrlogin.html` 的链接。
- 创建 / 加入 / 匹配三件事平铺堆叠，没有主次；加入房间被折叠在 `<details>` 里。
- 房间里「待播队列」和「在线成员」占同样的视觉权重，但成员信息量小得多。
- 中文标题 + 英文副标题（`LISTEN TOGETHER / API-ENHANCED · MULTI ROOM CONSOLE`）与正文中文混排，风格不统一。

### 1.2 响应式问题

- 只有 `max-width: 600px` 一个断点：**601–1023px 平板**仍是 `280px + 1fr` 硬两栏，右侧播放器被挤扁。
- 手机端顶栏被挤成三行（品牌 / 状态 / 登录），下方大片空白（见 `before-390.png`）。
- 房间页在手机上仍是「成员 → 主区 → 队列」DOM 顺序，单手操作时核心的播放器不在首屏。
- 聊天采用**可拖拽 FAB + JS 计算气泡坐标**（`chatDialogStyle` 用 viewport 手算边界），是越界与错位 bug 的高发区。

### 1.3 功能缺口（后端已有接口，前端没用起来）

| 后端接口                                                  | 现状       | 可做的功能                                              |
| --------------------------------------------------------- | ---------- | ------------------------------------------------------- |
| `/listentogether/multi/landing/info`                      | 未使用     | 分享链接落地预览页（邀请人 / 成员 / 当前歌 + 加入按钮） |
| `/match/played/song/list` + `/played/song/info`           | 未使用     | 「已播」列表与歌曲详情                                  |
| `/listentogether/mutual_follows/get/v2` + `/multi/invite` | 未使用     | 邀请好友面板（互关 / 推荐 / 群聊）                      |
| `/multi/chatroom/token` `addr` `history`                  | 只用 token | IM 实时消息已接通，但没利用历史补洞、成员在线态         |
| `/match/wait/song/list`                                   | 未使用     | 全量待播队列（轮询兜底）                                |
| `/listentogether/multi/special/*`                         | 部分       | 特殊房（`specialOperate` 房）操作适配                   |
| `/lyric`、`/song/url/v1`                                  | 只用 url   | 歌词滚动、多档音质菜单、试听片段提示                    |

### 1.4 与 `music-party` 桌面端的功能对照

对照对象：`~/git_repos/music-party`（Electron + React 19 桌面客户端，直接依赖 `@neteasecloudmusicapienhanced/api`，是目前一起听功能覆盖最完整的实现）。结论：**房间核心同步能力基本对齐，差距集中在「已播 / 成员推荐 / 歌词 / 邀请落地 / 聊天细节 / 发现音乐 / 私信」**，另有若干 Electron 专属能力不适用于浏览器。

| 能力                                  | 本 demo                        | music-party                   | 结论                                          |
| ------------------------------------- | ------------------------------ | ----------------------------- | --------------------------------------------- |
| 创建房间（私密 / 公开好友房）         | ✅                             | ✅                            | 对齐                                          |
| 匹配用歌                              | ⚠️ 有，但缺省兜底 `1372188635` | ✅ 必须选歌才能创建           | **需修**：未选歌应禁用创建/匹配               |
| 陌生人匹配 / 取消 / 重新匹配          | ✅ SSE + ACK                   | ✅ 同样用 ACK 确认            | 对齐                                          |
| 恢复当前房间                          | ✅                             | ✅                            | 对齐                                          |
| 链接**预览后**加入                    | ❌ 解析后直接 join             | ✅ `landing/info` 预览 + 确认 | **缺**                                        |
| 成员列表 / 在线人数                   | ✅（含 NIM 实时成员）          | ✅（10s 独立刷新）            | 对齐                                          |
| 成员推荐（按人看待播 / 已播）         | ❌                             | ✅                            | **缺**                                        |
| 待播队列（全量分页）                  | ✅ 全量                        | ✅ 分页取全                   | 对齐                                          |
| 已播列表                              | ❌                             | ✅                            | **缺**                                        |
| 顶歌 / 删除自己的推荐                 | ✅                             | ✅                            | 对齐                                          |
| 一起听点赞 / 个人红心                 | ✅ 已分离                      | ✅ 已分离                     | 对齐                                          |
| 请求下一首（切歌）                    | ✅                             | ✅                            | 对齐                                          |
| 播放进度对齐 / 拒绝旧版本             | ✅                             | ✅                            | 对齐                                          |
| 暂停仅本机                            | ✅                             | ✅                            | 对齐                                          |
| 歌曲结束快速确认                      | ✅ onended + heartbeat         | ✅ 预计结束时间也触发         | 基本对齐                                      |
| 聊天历史分页                          | ⚠️ 固定拉 3 页                 | ✅ 上拉续页                   | **缺**：上拉补历史                            |
| 打开/加载时保持阅读位置               | ❌ 强制滚到底                  | ✅                            | **缺**                                        |
| 未读提示                              | ✅                             | ✅                            | 对齐                                          |
| 文字 / 网易云表情包                   | ✅                             | ✅                            | 对齐                                          |
| Unicode emoji / 颜文字                | ❌                             | ✅                            | **缺**                                        |
| 图片 / GIF 上传、粘贴图片             | ❌                             | ✅                            | **缺**（依赖上传接口）                        |
| 歌曲卡片 / 资源卡片（歌单·专辑）      | ⚠️ 仅歌曲卡                    | ✅                            | 部分                                          |
| @提及（完整昵称、光标插入）           | ❌                             | ✅                            | **缺**                                        |
| 草稿保留（关闭 / 切房间）             | ❌                             | ✅                            | **缺**                                        |
| 100 字（UTF-16）限制 + 计数           | ❌                             | ✅                            | **缺**                                        |
| Enter 换行 / Ctrl+Enter 发送          | ❌ Enter 直接发                | ✅                            | **不一致**：应改 Ctrl+Enter（中文输入法更稳） |
| 发送失败保留草稿、不自动重发          | ⚠️ 清空输入                    | ✅                            | 需改                                          |
| 歌词滚动 / 回到当前句                 | ❌                             | ✅                            | **缺**                                        |
| 沉浸式播放页（封面 + 歌词 + 成员）    | ❌                             | ✅                            | **缺**                                        |
| 音量滚轮 + 百分比常驻                 | ❌ 仅滑块                      | ✅                            | **缺**                                        |
| 音质档位                              | ✅ 5 档                        | ✅                            | 对齐（demo 更细）                             |
| Media Session（系统媒体键）           | ❌                             | ✅                            | **缺**（浏览器可用）                          |
| 关键词搜索加歌                        | ✅ 仅弹窗内                    | ✅                            | 对齐基础                                      |
| 全站搜索 + 分页 + 搜索历史            | ❌                             | ✅                            | **缺**                                        |
| 歌单 / 专辑 / 歌手详情 → 推歌         | ❌                             | ✅                            | **缺**（较大）                                |
| 我的歌单 / 喜欢页                     | ❌                             | ✅                            | **缺**（较大）                                |
| 复制分享链接 / 歌曲链接               | ✅                             | ✅                            | 对齐                                          |
| 邀请面板（互关 / 推荐 / 群聊）        | ❌                             | ✅                            | **缺**                                        |
| 私信（会话 / 历史 / 邀请卡 / 在线态） | ❌ 完全没有                    | ✅ 完整模块                   | **缺**（大模块）                              |
| 深 / 浅 / 跟随系统主题                | ❌                             | ✅                            | **缺**                                        |
| 字号缩放 / 强调色 / 自定义背景        | ❌                             | ✅                            | 可选                                          |
| 键盘快捷键 / Esc 分层退出             | ⚠️ 仅 Esc 关弹层               | ✅                            | **缺**                                        |
| 诊断日志导出                          | ⚠️ 仅面板                      | ✅ 可导出                     | 小改                                          |
| 响应式（桌面 / 平板 / 手机）          | ⚠️ 仅 600px 断点               | ✅ 窗口连续伸缩               | 需重做                                        |
| 托盘 / 自动更新 / 密钥环 / 单实例     | ❌                             | ✅                            | **不可移植**（Electron 专属）                 |

**补齐优先级**（按「价值 ÷ 成本」排序）：

1. 立刻做（P2–P3 内）：已播列表、上拉补历史 + 位置保持、草稿、100 字限制、Ctrl+Enter、Unicode/颜文字面板、@提及、连接状态灯、toast。
2. 接着做（P4）：歌词、沉浸式播放页、音量滚轮 + 百分比、Media Session、快捷键、诊断导出、邀请面板、landing 预览、搜索分页 + 历史。
3. 大模块（独立阶段）：私信、图片/GIF 上传、歌单/专辑浏览、自定义皮肤。
4. 不移植：托盘 / 更新 / 密钥环 / 单实例 / 系统全屏。

---

## 2. 重构原则

1. **零构建**：仍是 Express 静态目录 + 浏览器原生脚本。不引入 Vite/Rollup/TS，不新增 `package.json` 依赖，不影响 CI 与 npm 包内容。
2. **行为兼容**：接口路径、SSE 时序、心跳/状态轮询节奏、`mergeCookie` 逻辑、localStorage 键名全部保持，重构只改「组织方式 + 呈现方式」。
3. **渐进可回滚**：每个阶段结束页面都能跑；旧文件在新版稳定后再删。
4. **可验收**：每个阶段给出截图断点 + 功能回归清单，不靠「看起来差不多」。
5. **视图与连接解耦**：把「数据同步」（轮询/SSE/IM/音频）从「界面组件」里抽出来，组件只读 store + 调 action。

---

## 3. 目标信息架构

四个视图，用极轻量路由（`location.hash` + `?roomId=`，不引路由库）串联：

```
① 登录 / 入口        未登录：品牌区 + 内嵌二维码登录 + Cookie 模式说明
② 大厅 Lobby         创建房间（选歌 + 公/私）/ 加入房间 / 随机匹配（雷达动画、可取消）
③ 房间 Room          顶栏 + 主舞台播放器 + 队列 + 成员 + 聊天（核心，占 90% 使用时长）
④ 分享落地 Landing    带 ?roomId= 打开：房间预览 + 加入
```

### 3.1 房间页布局（核心）

```
┌──────────────────────────────────────────────────────────────┐
│ ← 房间类型 · 3 人在线 · ●已同步        [分享] [邀请] [⚙调试]  │  顶栏（吸顶）
├───────────────┬──────────────────────────────┬───────────────┤
│  成员 (300)   │        主舞台 Main Stage      │  聊天 Dock    │
│  ┌─────────┐  │  ┌────────────────────────┐  │ ┌───────────┐ │
│  │ 头像墙   │  │  │   封面（模糊同图做背景光）  │  │ │ 消息流     │ │
│  │ 房主标记 │  │  │  歌名 / 歌手 / 加歌者徽标  │  │ │ 日期分隔   │ │
│  │ 在线状态 │  │  ├────────────────────────┤  │ │ 未读分隔线  │ │
│  └─────────┘  │  │ 进度条 01:23 ──── 03:45 │  │ │ 跳到底部    │ │
│  [邀请好友]    │  │ ⏮ ⏯ ⏭   🔊  ▁▂▃  ♡  ↑  │  │ └───────────┘ │
│               │  └────────────────────────┘  │  [输入框 😀]  │
│  ── 待播 (12) ──│  顶歌 / 点赞 / 切歌 / 音质菜单 │               │
│  队列卡片 × N  │                               │  表情 / 表情包 │
└───────────────┴──────────────────────────────┴───────────────┘
```

- **主舞台**：大封面 + 同图模糊背景（`filter: blur()` + 渐变遮罩，颜色取自封面主色），进度条可拖动，控制键 ≥44px。
- **队列**：`待播 / 已播` 两个 tab（已播走 `played/song/list`），每行：封面、歌名歌手、加歌者、顶数、顶歌/删除、冷却态。
- **成员**：头像墙 + 房主/我 标记 + 在线圆点；顶部「邀请」打开邀请面板（互关/推荐/群聊），失败自动隐藏入口。
- **聊天**：不再用「可拖拽 FAB + JS 算坐标」。桌面 ≥1280px 常驻右侧 dock；1024–1279 折叠为右侧抽屉；<1024 变成底部 sheet。拖拽逻辑整体删除。
- **调试面板**：`SongID / BizID / ChatRoomID / 权限 / 原始日志` 收进 `?debug=1` 或设置里的「开发者」抽屉，默认不出现。

### 3.2 响应式断点策略

| 宽度      | 布局                                                                     |
| --------- | ------------------------------------------------------------------------ |
| ≥1440     | 3 栏：成员 300 + 主舞台自适应 + 聊天 380                                 |
| 1024–1439 | 2 栏：主舞台 + 聊天 dock 360；成员收进主舞台顶部头像条（可展开）         |
| 768–1023  | 单栏：主舞台在上，`队列/成员` 用分段控件切换；聊天右侧抽屉               |
| <768      | 单栏 + 常驻底部 mini player + 底部 tab（房间/队列/聊天）；聊天全屏 sheet |

移动端细节：`100dvh` + `env(safe-area-inset-*)`、触控目标 ≥44px、禁止横向滚动、输入框聚焦时不被键盘顶掉、下拉刷新不误触。

---

## 4. 视觉设计方向

1. **设计 token**（`css/tokens.css`）：色板（背景/表面/文字/描边/主色网易红 `#ec4141`/成功/警告）、间距 4 的倍数、圆角（8/12/20/999）、阴影 3 级、字阶（12/13/14/16/20/28）。
2. **双主题**：默认跟随 `prefers-color-scheme`，可在顶栏切换并记忆（localStorage `lt_theme`）。
3. **封面驱动氛围**：主舞台背景 = 封面小图放大 + `blur(40px)` + 半透明遮罩，切歌时 400ms 交叉淡入。
4. **图标统一**：Font Awesome 6 Free（CDN，加载失败自动降级；由 `js/boot.js` 与 Vue/axios 一起重试），彻底去掉 `👍 ↑ ✅ ♡` 这类 emoji 图标。
5. **状态可视化**：SSE / 心跳 / IM 三条连接合成一个「连接状态」灯（同步中/重连中/离线，hover 看明细），不再靠一行 `message` 文本。
6. **反馈**：`toast` 替代 `alert`（成功/失败/可重试），匹配用雷达动画 + 计时，加歌冷却用环形倒计时，列表加载用骨架屏，空态用 CSS 插画 + 一句引导。
7. **动效**：统一 180–240ms `ease-out`；`prefers-reduced-motion` 下全部降级为淡入。

---

## 5. 工程结构（已落地）

实现比原计划更紧凑：业务逻辑按「域」拆进 `js/methods/*`，视图按「区域」拆成 4 个组件文件，模板仍集中在 `index.html` 的 `<template id="tpl-*">` 片段里，方便直接读改。

```text
listen_together_multi/
├── index.html              壳 + 全部模板片段 + 图标（Font Awesome class）
├── README.md               使用说明
├── REFACTOR_PLAN.md        本文档
├── css/                    tokens / base / layout / player / queue / chat
└── js/
    ├── boot.js             依赖加载器（jsDelivr → unpkg → 错误面板）
    ├── core.js             请求实例、日志、存储、常量、工具
    ├── stickers.js         内置表情
    ├── state.js            共享响应式 store
    ├── computed.js         视图 / 房间 / 播放 / 聊天派生状态
    ├── methods/            common · api · room · match · stickers · songs
    │                       queue · chat · lyrics · invite · ui
    ├── components/         shell · room · chat · overlays
    ├── mounted.js          监听、计时、音频、快捷键、启动
    ├── mock.js             ?mock= 预览数据
    └── app.js              组装 store 与根组件
```

组件与根实例共享同一份 store：`data` 返回同一个响应式对象，`computed` / `methods` 同源注入，避免层层 props 与事件。

补充的开发体验设施：

- **`?mock=1` / `?mock=lobby` / `?mock=chat`**：无需登录即可看到完整房间/大厅/聊天。当前未登录什么都看不到，是最大的验收障碍。
- **`?ui=song|share|invite|settings|debug|members|landing|lyrics|immersive`**：直接打开对应弹层，便于截图与走查。
- **`?theme=dark|light|auto`**：临时覆盖主题。
- **`?debug=1` 之外的诊断**：聊天/调试面板内可导出诊断 JSON。

---

## 6. 阶段计划

| 阶段                   | 内容                                                                                                                                    | 产出 / 验收                             | 预估       |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ---------- |
| **P0 基座**            | 目录拆分、模板片段、tokens、CDN 失败兜底、`?mock=1`                                                                                     | 行为不变可运行；mock 页可截图           | 0.5 天     |
| **P1 观感与响应式**    | 外壳 + 顶栏 + 大厅 + 登录页 + 四断点栅格 + 双主题 + 原语                                                                                | 390/768/1280/1920 四断点无横向滚动      | 1 天       |
| **P2 房间核心**        | 主舞台播放器、待播 / **已播**、成员、分享、冷却环                                                                                       | 播放/切歌/顶歌/删歌/点赞对齐旧版 + 已播 | 1 天       |
| **P3 聊天**            | dock / sheet、消息分组、未读分隔、**上拉补历史 + 位置保持**、草稿、**100 字限制**、**Ctrl+Enter**、**Unicode/颜文字/表情包**、**@提及** | 桌面 dock 与手机 sheet 均可用           | 1.5 天     |
| **P4 体验与发现**      | 歌词（滚动 + 回中）、沉浸式播放页、音量滚轮 + 百分比、Media Session、快捷键、诊断导出、邀请面板、landing 预览、搜索分页 + 历史          | 新入口失败可降级隐藏                    | 1.5 天     |
| **P5 打磨**            | a11y、动效、空态、错误恢复、文档                                                                                                        | 键盘可完成主要操作；对比度达标          | 0.5 天     |
| **P6+ 大模块（另议）** | 私信、图片/GIF 上传、歌单/专辑浏览、自定义皮肤                                                                                          | —                                       | 每个 ≥1 天 |

---

## 7. 验收清单

**视觉 / 响应式**

- [ ] 360 / 390 / 768 / 1024 / 1280 / 1920 六档截图，无横向滚动、无元素重叠
- [ ] 手机首屏能看到「正在播放 + 主控制」
- [ ] 浅色 / 深色两套主题，跟随系统 + 手动切换
- [ ] 触控目标 ≥44×44px，键盘 Tab 焦点环可见

**功能回归（对照旧版）**
登录态、创建房间、随机匹配 / 取消、加入房间（房间号 / 分享链接）、正常退出、重新匹配、加歌（链接解析 / 关键词搜索 / 冷却）、顶歌、删除自己的歌、切歌、点赞、喜欢、音质切换与降级、音量、拖动进度、聊天发文字 / 表情 / 歌曲卡、存表情、IM 实时成员、复制分享链接 / 歌曲链接、刷新恢复房间。

**新增功能（对照 music-party 补齐）**
已播列表、上拉补历史 + 阅读位置保持、草稿、100 字限制、Ctrl+Enter、Unicode/颜文字/表情包三分栏、@提及、歌词、沉浸式播放页、音量滚轮、Media Session、邀请面板、分享落地预览、搜索分页 + 历史、诊断导出、连接状态灯、toast、`?mock=1`、`?debug=1`。

**工程**

- [ ] 不新增 npm 依赖，`pnpm lint`、`pnpm docs:check`、`main.test.js` 不受影响
- [ ] `/listen_together_multi/` 与旧 `.html` 重定向保持不变
- [ ] 无 `alert()`、无未处理的静默 catch（错误至少进 toast 或日志）

---

## 8. 风险与对策

| 风险                                   | 对策                                                                                                      |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| 匹配房需**两名在线用户**，单人无法联调 | 用 `?mock=1` 验收 UI；真实联调用「创建私密房 + 第二个浏览器」验证                                         |
| 邀请面板 / 特殊房接口字段可能变动      | 入口按能力探测，失败静默隐藏，不阻塞主流程；日志留痕                                                      |
| CDN 在国内可能不可达                   | 按用户决定仍走 CDN，但由 `js/boot.js` 依次尝试 jsDelivr → unpkg，全部失败时渲染可重试的错误面板，不再白屏 |
| `public/` 不在 eslint 范围内           | 用 `pnpm exec prettier --write` 保证格式一致；重构完成后跑一次                                            |
| 一次性重写回归面大                     | 分阶段、旧文件保留到 P2 结束再用 git 删除，可随时回退                                                     |

---

## 9. 本轮不做的事

- 不引入 bundler / TypeScript / React / 其他框架，不改 Express 托管方式。
- 不改动任何 `module/*` 后端接口行为（如需补字段另开 PR）。
- 不动 `listen_together_host.html` 等其他 demo。
- 不做真正的服务端同步播放（服务端只提供时间戳，本地播放仍是跟随式）。
- **P6+ 大模块本轮不做**：私信（会话/历史/邀请卡/在线态）、图片/GIF 上传、歌单/专辑/歌手浏览、自定义播放器皮肤。
- **Electron 专属不移植**：托盘、应用内更新、系统密钥环、单实例、原生全屏。

---

## 10. 实施结果

已完成 P0–P4 主体，P5 部分完成：

| 阶段 | 状态 | 说明 |
| --- | --- | --- |
| P0 基座 | ✅ | 目录拆分、模板片段、设计令牌、CDN 失败兜底、mock 预览 |
| P1 观感与响应式 | ✅ | 深色优先 + 浅色主题、封面氛围光、四断点栅格、登录/大厅重做 |
| P2 房间核心 | ✅ | 主舞台播放器、待播 / 已播、成员、分享、冷却倒计时 |
| P3 聊天 | ✅ | 聊天 dock / 手机分区、上拉补历史、草稿、100 字、Ctrl+Enter、Emoji/颜文字/表情包、@提及 |
| P4 体验与发现 | ⏳ 部分 | 已做：歌词、沉浸、音量滚轮、Media Session、快捷键、诊断导出、邀请面板、落地预览、搜索分页与历史。未做：搜索页 / 歌单·专辑浏览 |
| P5 打磨 | ⏳ 部分 | 已有空态/骨架/Toast/减少动效；a11y 仍可继续（aria-label 覆盖、对比度细调） |
| P6+ 大模块 | ⛔ 未做 | 私信、图片/GIF 上传、自定义皮肤（见 README 说明） |

与计划的偏差：

1. **没有本地化 Vue/axios**：按确认改为 CDN + 失败兜底，并新增 `js/boot.js` 统一管理依赖与错误面板。
2. **组件拆分粒度更大**：4 个组件文件而非 12 个小组件，换取更少的样板代码与更低的合并风险。
3. **未引入 `js/features/*`**：逻辑仍放在 `js/methods/*`，但已按域拆分（chat / lyrics / invite / queue / ui 独立成文件）。
4. **`index.html` 不能用 Prettier 格式化**：会把 `{{ }}` 里的长表达式折断成语法错误，已在 README 记录。

---

## 11. 第二轮问题修复（按反馈）

| 反馈 | 处理 |
| --- | --- |
| 图片显示用原图 | 新增 `util.imageUrl()`，按展示尺寸拼 `?param=WxH`（封面 96/128/640、头像 72/96、氛围光 240），网易云域名以外的 URL 原样返回 |
| 选歌没有预览 | 选歌弹窗内置试听：标准音质、播放/暂停、**可拖动进度**、试听片段标记；换歌自动切换，关窗停止 |
| 选歌界面长宽波动 | 弹窗固定 `560 × min(660, 88dvh)`，结果区独立滚动，选中卡片与试听条固定在底部 |
| 展开歌词出现滚动条 | `.lt-app` 修正 `100dvh` 覆盖顺序；舞台隐藏内部滚动条；歌词展开时用 `.has-lyrics` 收紧播放器；歌词自身内部滚动 |
| IM 漏 30000 / 30008 | 在 `match.js` 消费 IM 广播：30000 直接对齐播放状态，30008 更新计数并防抖校准，30005 刷新成员，聊天消息触发一次历史拉取；HTTP 轮询保留兜底 |
| 已登录仍轮询二维码 | 登录组件改为「先查登录态、未登录才扫码」；`login()` 并发去重；登录成功后立即停止二维码轮询；预览模式下不请求登录态 |

---

## 12. 第三轮问题修复（按反馈）

| 反馈 | 处理 |
| --- | --- |
| IM 启用后仍在轮询聊天历史，费流量 | `startPolling` 在 `imConnected` 时跳过 `fetchChat`；连接成功先拉一次，之后靠 IM 推送 |
| 想把 IM 的聊天消息增量并入 | `appendImChatMessage()` 解析 `serverExt`（msgId / userId / nickname / avatarUrl）+ `msg.text`，复用 `mapChatRecord` 生成消息，`appendChatMessage()` 去重后直接插入并处理未读；解析失败才回退历史拉取 |
| 怀疑 body#3 是纯文本、调试面板乱码 | 确认 body#3 即文本；新增 `util.fixMojibake()`，严格 UTF-8 解码还原 latin1 形式的文本，非法序列保持原样 |
| Firefox 选音质时随进度刷新闪烁 | 原生 `<select>` 换成自定义菜单（按钮 + `lt-menu` 弹层），不再让原生控件参与高频重渲染；点击外部 / Esc 关闭 |
| 选中歌曲后列表立刻消失 | 去掉 `selectSong()` 里清空 `songResults` 的逻辑，列表保留并高亮选中项 |

---

## 13. 第四轮问题修复（按反馈）

| 反馈 | 处理 |
| --- | --- |
| 自定义表情无法删除 | 新增后端模块 `module/social_emoji_cancel.js`（`/social/emoji/cancel`，payload `emojiIds: "[id]"`）；表情面板里可删除的贴纸显示 ×，两段式确认后同时清理本地收藏与网易云自定义表情；内置表情不可删 |
| 表情显示太小 | 消息内贴纸 104px → `clamp(140px, 42vw, 192px)`，纯贴纸消息去掉气泡底；面板网格 38px → 64px（移动端 56px），面板可视区加高 |
| 「刷新成员」不该有 | 移除成员区刷新按钮；成员列表改为 IM 优先：`applyStatus` 在 IM 已建立成员列表时不再用 HTTP 快照覆盖，头部改为「IM 实时 / HTTP 快照」来源标识，未连接时仍可在底部手动连接 IM |

---

## 14. 成员人数与快照截断

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 房间 20 人却只显示 6 人 | 30005 的 `content.onlineNums = 20`，但 `onlineUserInfos` 只下发 6 条（服务端截断） | 人数以 `onlineNums` 为准，列表显示「已获取 N / 总数」，并提示还有多少人未下发 |
| IM 与 HTTP 互相覆盖 | HTTP 状态每 30s 用残缺快照整体替换列表 | 改为按 uid 合并：IM 条目优先，HTTP 只补充 IM 没有的成员；IM 断开时释放成员所有权 |
| 30005 昵称乱码 | NIM 文本按 latin1 交付 UTF-8 字节 | 解析 JSON 前先 `util.fixMojibake()` 修复整段 payload，昵称再兜底一次 |
| 图片 http 链接 | 网易云有时返回 `http://` | `imageUrl()` 统一升级为 `https://`，避免 HTTPS 部署被 mixed content 拦截 |

### 14.1 30005 是否分批？——不是

连续抓到的 4 条 30005：

- `onlineNums` 依次 19、19、20、20；
- `onlineUserInfos` **每次都是同一组 6 个 uid**（1815230675 / 1902441872 / 8575810675 / 8657632486 / 8410024901 / 3582525814），昵称、头像一致；
- 只有 `serverSeq` / `version` 在变。

结论：服务端对该事件做了硬截断（或只下发「活跃/可见」子集），不是分页、分片，也不是前端合并丢人。`landing/info` 返回的是 `inviter + others`，反而更少。

因此已做：
1. 人数用 `onlineNums`；名单显示「已获取 N / 在线 M」，并明确「服务端只提供部分名单」；
2. 三路合并（IM 30005 优先 → HTTP 状态 → 邀请页），能多拿一个是一个；
3. 修复邀请预览页之前没解析 `inviter/others` 导致成员为空的问题。

---

## 15. 空消息与互动消息

抓到的点赞广播样例：

- body#3 只有一个空格（`" "`），真正的正文在 `serverExt.imChatRoomMsgBody.mainStateText`；
- `serverExt.msgType = 1`、`interactType = 3`，并带 `resourceInfo`（歌曲卡片）。

处理：

1. **正文优先级**：`mainStateText` → `text` → body#3，且 `trim()`；只有空格视为空。
2. **互动消息**按系统消息渲染（居中、无头像、标题「房间互动」），带歌曲卡片与「加歌」按钮；历史记录里 `msgType = 1` 的记录同样处理。
3. **空正文**（无文本、无表情、无资源）直接忽略，且不再触发 `fetchChat()`。
4. 未读只统计「别人发的普通消息」，系统通知与互动消息不刷红点。
5. `30005` 成员按 uid **跨帧累积**（15 分钟 TTL、上限 `onlineNums`），避免每帧子集不同导致名单来回变少。

---

## 16. 系统消息重复两遍

现象：「推荐了 xxx」「@xxx 来了，带来了 yyy」同一条出现两次。

原因：同一条系统/互动消息有两条到达路径——IM 推送一次、随后 `msg/history` 又回填一次；而互动消息的 `serverExt` 里**没有 `msgId`**，只有 `serverSeq`，两边生成的 id 不一致，`mergeChatMessages` 按 id 去重失效。

处理：

1. 互动消息 id 优先取 `serverExt.serverSeq`；
2. 新增内容级去重 `isDuplicateMessage()`：文本相同 + 系统属性相同 + 发送时间差 ≤ 4 秒即视为同一条；双方都是系统消息时不比较发送者（IM 与历史对 sender 字段填充不同）；
3. `mergeChatMessages()` 与 `appendChatMessage()` 都走这套判定；
4. `mapChatRecord()` 对互动消息统一把 `sendUid` 置空，两条路径的消息形态一致。

单元验证：跨来源同文本系统消息合并为 1 条；同文本但普通消息/系统消息仍保留 2 条；不同发送者同文本保留 2 条。

---

## 17. 邀请面板空白

`mutual/follows/get/v2` 的响应结构是：

```json
{ "data": {
  "mutualFollowLists": [
    { "userInfo": { "userId": 8815511246, "nickname": "...", "avatarUrl": "..." },
      "online": true, "inRoom": false, "recommendReasons": ["在线"] }
  ],
  "multiGroupLists": [], "aiRobots": [], "liveRoomRcmdLists": null
} }
```

之前只认 `users / follows / friendList / ...`，完全没匹配 `mutualFollowLists`，所以面板永远是空的。

处理：

1. `collectInviteUsers()` 以 `mutualFollowLists` 为首要来源，兼容 `userInfo / user / 自身` 三种包裹；读取 `online`、`inRoom`、`recommendReasons`、`description`；
2. 群聊来源加入 `multiGroupLists`，兼容 `groupInfo / group / info / 自身`；
3. 列表按在线优先排序，副标题展示「在线 / 离线 / 已在房间中 · 推荐原因」。

---

## 18. 回归：IM 处理方法被误删

现象：工作日志每 30 秒出现一次 `IM广播解析失败 this.applyImPlayState is not a function`，操作歌曲时还会出现 `applyImOperate` 同类错误。

原因：重写 `appendImChatMessage()` 时用了「从 appendImChatMessage 到 applyImMembers」的区间替换，而 `applyImPlayState` / `applyImOperate` 正好位于两者之间，被一并删掉。由于调用点在外面、又被 `handleImMessage` 的 try/catch 兜住，所以只在真实房间的 IM 广播里静默失败——播放同步退回 5 秒心跳，操作同步退回 30 秒状态轮询。

修复：

1. 恢复 `applyImPlayState()`：30000 的 playSong / playedTime / version 直接对齐，`zanCnt` 缺失时不覆盖，`waitSongCount` 变化时补拉队列；
2. 恢复 `applyImOperate()`：30008 的 zanCnt / upCnt / bizId 就地更新，并防抖拉一次状态与队列；
3. `app.js` 启动时校验关键方法列表，缺失即写工作日志 + `console.error`；
4. 顺带跑了全量 `this.xxx()` 调用与定义的静态比对，当前无缺失。

---

## 19. 歌单：长按红心收藏 / 选歌时挑歌单

1. **长按红心收藏到歌单**
   - 红心 `pointerdown` 520ms 触发 `openCollectSheet()`，普通点击仍走喜欢/取消；桌面右键同样打开；
   - 弹层读取 `/user/playlist`（创建 + 收藏，创建在前），点歌单执行 `/playlist/tracks`（`op=add&pid&tracks`），成功后歌单曲目数 +1；
   - 未登录、接口失败都会给出明确提示。

2. **选歌弹窗「我的歌单」**
   - 新增「搜索 / 我的歌单」两个页签；
   - 歌单列表展示封面、曲目数、「我创建的 / 我收藏的」；
   - 进入歌单用 `/playlist/track/all?id&limit=100&offset=` 分页读取，列表底部可继续加载；点歌曲即选中并试听，footer 仍是「添加到队列」。

3. **Cookie 合并**
   - 这两个 GET 接口带伪装 Android cookie，必须同时传 `mergeCookie: 'body'`，否则会覆盖请求头里的 `MUSIC_U` 导致“明明登录了却提示未登录”。

4. **预览**
   - `?ui=mylists`（歌单列表）、`?ui=playlists`（歌单内歌曲）、`?ui=collect`（收藏弹层）。

### 19.1 回归：选歌预览条丢失

重排选歌弹窗 body 时，整段替换的区间把 `.lt-picker__foot`（已选歌曲 + 试听条）一起删掉了，所以「选中后没有试听控制」。已恢复该区块，并确认两个页签（搜索 / 我的歌单）选中歌曲后都会出现：封面标题 + 播放/暂停 + 可拖动进度 + 试听状态。

---

## 20. 试听时静音房间音频

需求：选歌试听时把一起听正在播放的音乐静音，选完或关闭弹窗再恢复。

实现（`js/methods/preview.js`）：

- `syncPreviewAudio()` 里根据 `preview.playing` 调用 `muteRoomForPreview()` / `restoreRoomForPreview()`；
- `muteRoomForPreview()` 记录 `player.volume` 并把主播放器音量置 0；`restoreRoomForPreview()` 恢复为 `audioVolume`（用户偏好不变）；
- `stopPreview()`（关闭弹窗、加歌成功、切歌清理）都会显式恢复；
- 试听音量独立：房间本身静音时试听仍以 0.8 播放，避免“试听也没声音”。

行为细节：暂停试听就恢复房间声音（方便来回对比），不需要等到关闭弹窗；想改成“仅关闭弹窗恢复”，把 `syncPreviewAudio()` 里的 `else this.restoreRoomForPreview()` 去掉即可。

---

## 21. 重新匹配后 IM 没切到新房间

原因：NIM 的 `disconnect()` 是异步的，旧连接稍后触发的 `ondisconnect/onconnect/onmsgs` 会把新房间刚建立的连接状态和 `_imChatroom` 引用覆盖掉；`autoConnectIm()` 又用 `imConnected` 判断，旧值残留时直接跳过重连。

处理：

1. 引入 `_imGeneration`：`connectImMembers()` 与 `disconnectImMembers()` 各自递增；所有 SDK 回调（connect / disconnect / error / msgs）先校验 generation，旧连接回调直接丢弃，必要时主动 `disconnect()`；
2. `disconnectImMembers()` 先置空 `_imChatroom` 再断开，同时清空成员缓存与签名并重算列表；
3. `autoConnectIm()` 改为以 `_imChatroom` 为准（不再信任可能残留的 `imConnected`）；
4. `resetLocalState()` 无条件调用一次 `disconnectImMembers()`，保证退出 / 重新匹配一定换代。

---

## 22. 聊天回到底部 / 歌单吸顶 / 滚动加载

1. **聊天「回到底部」**
   - `.lt-chat__flow` 包住消息区，右下角浮动按钮：`v-if="!chatAtBottom || chatUnread"`，显示未读数；
   - `jumpChatToBottom()` 同时重置 `chatAtBottom`、清空未读锚点并滚到底。

2. **歌单标题吸顶**
   - `.lt-picker__plhead` 改为 `position: sticky; top: 0`，背景 `--lt-elev`，返回按钮/歌单名/刷新始终可见；
   - 进入/退出歌单时 `resetPickerScroll()` 把列表滚回顶部。

3. **滚动到底自动加载**
   - `.lt-picker__list` 绑定 `onPickerScroll()`：距底部 ≤120px 时，歌单页触发 `loadMorePlaylistTracks()`，搜索页触发 `loadMoreSearch()`，并各自用 loading 标志防重入。

---

## 23. 推荐完歌后房间音量没恢复

现象：选歌试听中快速点「添加到队列」，房间音量一直是 0，直到手动拖一下音量条。

原因：`previewSelectedSong()` 里 `/song/url/v1` 是异步的。用户可能在请求返回前就关窗/加歌，此时 `stopPreview()` 已经执行完（没有音源可停、没有静音可恢复），随后请求返回并 `audio.play()`，触发 `play` 事件把房间音量置 0——但弹窗已关，没有代码再去恢复。

处理：

1. **代际令牌** `_previewEpoch`：每次开始试听、`stopPreview()` 都会递增；请求返回后校验 epoch 与 `songOpen`，不一致直接丢弃（不设 src、不 play）；
2. `syncPreviewAudio()` 里只有 `songOpen` 为真才静音房间；若发现弹窗已关但试听还在播，立即 `pause()` 并恢复；
3. `restoreRoomForPreview(force)` 支持强制恢复，`stopPreview()` 用 `force=true`，即使静音标记异常也不会留下静音房间；
4. 单测覆盖了两条路径：请求在关窗后返回 → 不播放、音量恢复 0.7；弹窗已关但 play 事件迟到 → 立即暂停并恢复。

---

## 24. 试听与房间声音混在一起

现象：选中歌曲试听时，能同时听到一起听播放；按两下试听的播放/暂停才恢复正常。

原因有两层：

1. `muteRoomForPreview()` 之前以布尔标记 `_previewMutedRoom` 做幂等（已静音就直接 return）。一旦主播放器音量被别的路径写回非 0（例如同步逻辑、外部调用），标记仍是 `true`，后续 `mute()` 全部提前返回，房间就一直可听；
2. 静音原本只挂在试听音频的 `play` 事件上，事件触发到实际出声之间仍有窗口期，两路会短暂叠音。

处理：

1. `muteRoomForPreview()` 不再提前返回，每次都把主播放器音量强制归零（仅在当前音量 > 0 时更新记忆值）；
2. 在 `audio.play()` **之前**同步调用静音；播放被拦截/失败时恢复；
3. `togglePreview()` 手动恢复播放时同样先静音，暂停时立即恢复；
4. `syncPreviewAudio()` 每个 `timeupdate` 都会校正，若音量被写回会再次归零（暂停/结束/关窗后恢复）。

单测：试听中把 `player.volume` 人为改回 0.7，下一次 sync 会重新归零；暂停后恢复 0.7。

---

## 25. 整体 Review（移动端优先）

截图矩阵：390（房间 / 沉浸 / 聊天 / 选歌 / 收藏）、768（房间）、1440（房间 / 歌词 / 沉浸）。控制台无报错，方法/事件/ID 静态审计通过。

发现并修复：

1. **移动端沉浸模式坏掉**
   - `.is-immersive` 的栅格只定义了 head/stage，但底部 tabbar 仍display:flex → 产生隐式行/挤压；
   - 修复：移动端沉浸模式隐藏 `.lt-tabbar`，显式定义 `grid-template-rows/areas` 并保留 safe-area 底部内边距。
2. **沉浸模式下点聊天会全空**
   - 沉浸隐藏了 `.lt-chat`，但顶栏聊天按钮仍能切 pane，导致 stage/chat 同时隐藏；
   - 修复：`setPane()` 在沉浸状态下切非 stage 分区时自动退出沉浸；顶栏聊天改用 `goChat()`。
3. **歌词不居中 / 卡在版权信息**
   - `.lt-lyrics` 同时存在 `min-height:200px` 与后面的 `min-height:0`，实际被压到 37px；且 `.lt-lyrics__body` 的 CSS `scroll-behavior:smooth` 让 `behavior:'auto'` 也变成平滑滚动，初次定位被祖先滚动动画打断；
   - 修复：去掉重复的 `min-height:0`；初次/布局变化后的定位改为直接写 `scrollTop`；歌词异步加载后 200ms/600ms 各补一次定位。
4. **歌词标题在窄屏竖排**
   - `.lt-card__title` 未处理收缩；已加 `nowrap + ellipsis` 给副标题、按钮区不收缩。
5. **桌面歌词区域偏小**
   - 桌面展开歌词时隐藏房间信息卡，把空间让给歌词（沉浸模式本来就不显示）。

## 26. 全面体检修复（v79）

本轮按「播放 / 聊天 IM / 房间匹配 / 响应式」四条线做了一次针对性体检，以下问题均已定位到具体代码路径并修复。

### 26.1 播放 / 音频

| 问题 | 原因 | 修复 |
| --- | --- | --- |
| 点暂停后音乐继续播放，暂停后点页面任意位置还会自动恢复 | `body` 上的 `unlockAudio` 只要发现 `audio.paused` 就调用 `play()`，暂停按钮的同一次点击冒泡到 `body` 后立即又播放；自动播放被拦截与用户主动暂停无法区分 | 新增 `localPaused`：`togglePlay()` 暂停时置位、播放/切歌时清除；`unlockAudio` 只在非主动暂停、非播放结束且状态不是 PAUSE 时尝试解锁 |
| 在选歌弹窗里试听后继续输入关键词，试听条消失但声音还在，房间被持续静音 | `onSongInput()` 清空 `selectedSong`（试听条 `v-if` 依赖它），却没有停止 `#previewAudio`；`syncPreviewAudio()` 继续按“试听中”静音房间 | 输入变化时若存在试听则调用 `stopPreview()`；切换试听歌曲时先暂停并清空旧音源，避免新音源加载/失败期间旧歌继续响 |
| 音质切换与切歌并发后，进度条、时间、播放图标永久冻结 | `audioSwitching` 只由 `onLevelChange()` 的 `onloadedmetadata` 清理，切歌会覆盖该回调 | `loadAudioForSong()` 开头清理旧回调和 `audioSwitching`；音质切换增加代际令牌与 10s 兜底，旧请求/旧回调直接丢弃 |
| 切歌时上一首会继续播放到新音源返回（高音质失败时可能十几秒） | `loadAudioForSong()` 要等 `/song/url/v1` 返回后才 `pause()` | 进入切歌流程立即暂停并清掉旧 src 状态，同时重置进度与时长 |
| 静音后刷新页面音量变成 100%，滑块拖到 0 后按静音恢复到硬编码 70% | `loadVolume()` 把 `0` 当成“未设置”；取消静音只用内存里的 `_volumeBeforeMute` | `loadVolume()` 只把空字符串视为未设置并接受 0；记住最后一次非零音量到 `audio_volume_before_mute`，刷新后也能恢复 |
| 系统媒体键的 play/pause 实际是 toggle | 两个 handler 都调用 `togglePlay()` | play 只在暂停时播放，pause 只在播放时暂停，并补充状态判断 |
| 连续 3 次心跳失败后轮询永久停止，刷新房间也救不回来 | `checkFailures()` 只 `stopPolling()`，成功路径没有恢复 | `fetchStatus()` 成功后若房间仍存在且未在轮询，自动 `startPolling()`；手动刷新/回到前台即可恢复 |

### 26.2 聊天 / IM

| 问题 | 原因 | 修复 |
| --- | --- | --- |
| 4 秒内连续发两条相同内容，第二条永远不显示（刷新后也没有） | 内容级去重对所有消息生效，而不只是系统/互动消息 | 普通消息只在「IM 与历史回填」跨来源时按内容去重；同来源重复消息按 id 保留。系统/互动消息仍按「文本 + 4s」去重 |
| 互动消息在 IM 与历史里 id 不一致，仍可能重复 | `serverExt.serverSeq` 从未使用 | `mapChatRecord()` 与 IM 增量都优先 `serverExt.msgId || serverExt.serverSeq`，两条路径生成同一个 id |
| 退出/重新匹配后，旧房间的聊天、cursor 写进新房间 | `fetchChat` / `loadMoreChat` 在 `await` 后不校验房间与代际 | 记录发起时的 `roomId + pollGeneration`，返回后不一致直接丢弃；`loadMoreChat` 同样不再写入旧 cursor |
| 未读数把系统通知、互动消息、自己发的消息都算进去 | 轮询路径按“新增条数”直接累加 | 只统计 `!isSystem && !isMeUid(sendUid)` 的普通消息，未读分隔线定位到第一条未读普通消息 |
| 日志页签打开时聊天不可见，但新消息被当作已读 | 可见性判断只看 `chatOpen/pane/宽度` | 可见性增加 `chatTab === 'chat'` 条件（历史与 IM 两条路径都改） |
| IM 已连接仍在每 5 秒轮询聊天历史 | `startPolling()` 的聊天分支没有判断 `imConnected`（与文档/README 描述不一致） | IM 连接时跳过聊天轮询，断开后自动恢复 |
| 30005 成员用 `userId` / `id` 下发时成员全部丢失 | 存的是 `user.uid`（undefined），合并时按 uid 再取一次 | 存归一化后的 String uid，重建 Map 也用同一个 key |
| 成员改名/换头像后列表不更新 | 成员签名只比较 uid 集合 | 签名加入昵称与头像，变化时重新 `recomputeRoomUsers()` |

### 26.3 房间 / 匹配 / 队列

| 问题 | 原因 | 修复 |
| --- | --- | --- |
| 公房加歌冷却永远不出现，按钮一直可点 | 从 `res.data.nextAddSongDuration` 读，实际在 `res.data.data.nextAddSongDuration`；`status/get` 也完全没读 | 心跳/创建/加入/匹配接受/`applyStatus` 统一读 `data.nextAddSongDuration`，由现有 watcher 转成倒计时 |
| 退出房间/重新匹配时，在途的心跳或 status 响应把房间“恢复”出来，甚至开始播放旧歌 | `stopPolling()` 只停止调度，不取消在途请求；`applyStatus()` 无条件相信响应 | `heartbeat` / `fetchStatus` 捕获 `pollGeneration`，响应回来代际不一致直接丢弃；退出/重新匹配会递增代际 |
| 换房后已播列表/待播队列短暂显示上一个房间的数据，分页还会带旧 cursor | `fetchPlayed` / `fetchFullQueue` 没有响应后的房间校验 | 捕获发起时的 `roomId + pollGeneration`，每个 `await` 后校验；不一致立即停止，不写 cursor/队列 |
| 取消匹配后，在途的 `/match` 响应又把状态改回匹配中并重启轮询；匹配失败时 `isMatching` 卡死 | `requestMatch()` 没有生命周期令牌；失败分支只关 SSE 不清理状态/轮询 | 引入 `_matchEpoch`：开始/取消匹配递增，所有 `await` 后校验；新增 `failMatch()` 统一清理 `isMatching`、定时器、SSE 与轮询；SSE 15s 不 connected 也会超时退出 |
| 邀请接口失败仍提示「已发送」 | 返回结构是 `data.result` 布尔 + `failedMessage`，代码判断 `data !== false` 且读 `failedMsg` | 改为 `data.result !== false`，失败时展示 `failedMessage`；群聊人数改读 `groupMemberNum` |
| 分享落地页不显示当前歌曲，已结束房间仍能点加入 | 官方返回扁平 `songData` / `roomStatus`，代码只认 `snapshot.playSong`；邀请人 uid 回退也漏了 `inviter.uid` | `normalizeLanding()` 兼容 `songData`（名称/歌手/专辑封面）与 `roomStatus`；`inviterUid` 依次回退 URL → `inviter.uid` → `firstUserId`；非 `AVAILABLE` 时显示提示并禁用加入 |
| 快速切换歌单时，新歌单首屏被丢弃，旧歌单第二页串进新歌单 | 共用 `activePlaylistLoading` 同时阻塞新请求且不能取消旧请求 | 引入 `_playlistEpoch`，换歌单/返回/重置递增；旧响应不再写列表、offset、loading |
| 双击「创建房间 / 确认加入」会创建两个房间或发送两次 ack | 按钮只按空字段禁用，没有在途状态 | 增加 `creatingRoom` / `joiningRoom`，请求期间禁用按钮并显示「创建中/加入中」 |

### 26.4 响应式 / 交互

| 问题 | 原因 | 修复 |
| --- | --- | --- |
| 横屏手机上选歌弹窗的「取消/添加」按钮在视口外，无法加歌 | `.lt-modal__foot` 被写在 `.lt-picker` body 内部，body `overflow:hidden` 把它裁掉 | footer 移出 body，成为 modal 的直接子元素；矮屏下弹窗占满可用高度、压缩已选卡片与试听元信息，保证列表至少露出一行、footer 与试听条可见 |
| 横屏手机上顶栏房间菜单被底部 tabbar 盖住，「退出房间/调试」点不到 | `.lt-topbar{z-index:40}` 低于 `.lt-tabbar{z-index:50}`，菜单的 z-index 被困在顶栏层叠上下文里 | 顶栏提高到 60；菜单限制 `max-height` 并可滚动 |
| 大厅「允许陌生人加入」开关点击无效 | `<label>` 包着开关，开关自己 `@click` 切换一次，label 又把点击转发给 input 再切一次 | 去掉开关上的 `@click`，统一用 `v-model` 驱动 checkbox，由 label 激活 |
| 横屏手机打开表情面板后输入框/发送键被挤出聊天区，无法发消息也无法关面板 | 表情面板以普通流占据 composer 高度，聊天区 `overflow:hidden` | 矮屏下表情面板改为绝对定位浮在输入区上方，不再参与 composer 高度；composer 不裁剪浮层 |
| 打开设置等弹层后按 `/` 会在背后打开选歌弹窗；Esc 层级混乱 | 全局快捷键没有“有弹层”判断，Esc 顺序与 DOM 层叠顺序不一致 | 有任意 overlay 时禁用房间快捷键；Esc 按视觉层叠从高到低关闭；忽略 IME 组合中的 Esc |
| 触屏上自己的待播歌曲删除按钮不可见但可点，容易误删 | `.lt-track__del{opacity:0}` 只靠 hover/focus 显示 | `@media (hover:none)` 下常驻 0.55 透明度，按下时 1 |
| 刘海屏横屏时顶栏/底栏贴边控件进入安全区 | 只定义了底部安全区 | 增加 `--lt-safe-l/r`，顶栏与 tabbar 使用 `max()` 留出左右安全区 |

### 26.5 验收

- headless Chromium 截图矩阵：390 / 768 / 1024 / 1440 / 844×390（横屏）覆盖房间、聊天、沉浸、歌词、选歌、歌单、收藏、表情、分享、邀请、设置、调试、成员、落地页；控制台无脚本异常（仅 favicon 404）。
- 交互脚本验证：暂停后不再自动恢复、点击其他区域不恢复；静音 0 刷新后仍为 0；`Esc` 可关闭收藏弹层；有设置弹层时 `/` 不再打开选歌；大厅开关点击可切换；顶栏菜单在 844×390 下命中菜单项而不是 tabbar。
- 逻辑脚本验证：同来源重复普通消息保留、跨来源同文本合并、系统消息合并；`userId` 形式的 30005 成员可正确归一化与改名刷新；落地页 `songData/roomStatus/inviter.uid` 正确映射；`data.nextAddSongDuration=42` 能产生冷却倒计时。
- 版本号 `?v=79`。

## 27. 重新匹配串房修复（v80）

现象：点「重新匹配」后偶发进入旧房间，表现为 IM 聊天室/成员、当前播放歌曲仍来自上一个房间，Vercel 部署时更明显。

根因与处理：

1. **status 快照把旧房间当成新匹配结果**
   - `rematch()` 退出后立即 `resetLocalState()`，随后 `startMatch()` 的 status 轮询（每 2s）可能仍拿到旧房间；`applyStatus()` 的「匹配成功」和「已恢复所在房间」分支不区分房间，直接 ack 进入。
   - 现在 `resetLocalState()` 记录 `_exitingRoomId`；`applyStatus()`、`handleMatchEvent('ready')`、`acceptMatch()` 全部忽略这个旧房间；只有收到不同 roomId 才进入并清除标记。
   - 当前房间已存在时，若 status 返回的 `dto.roomId` 与本地不一致也直接丢弃。

2. **退出房间失败仍继续匹配**
   - `rematch()` 原先 `try { exit } catch {}`，退出失败也会 reset + match，服务端仍可能把账号留在旧房间。
   - 现在退出接口必须返回 `code=200` 才继续；失败会提示并保持原房间，不再制造幽灵状态。

3. **匹配 SSE / mini NIM 会话复用**
   - 服务端 `util/match-events.js` 的 session 只按 cookie 缓存，旧 mini NIM 在 SSE 关闭后会保留 15s；重新匹配的新 SSE 可能复用旧会话，收到上一轮的 `ready`。
   - `startMatch()` 每次生成新的 `session` nonce 并拼进 `/match/events`；服务端按 `cookie + nonce` 建 session，并主动关闭同账号的旧 session。EventSource 自动重连仍用同一 nonce，不会误杀。

4. **IM 旧连接回调/新连接失败互相覆盖**
   - `disconnectImMembers()` 的 `disconnect()` 是异步的；新房间可能先 `getInstance`。现在旧连接断开（或 1.5s 兜底）之前，新连接会等待；旧连接的 catch 也不会再清空新连接的 `_imChatroom` / `imConnecting`。
   - 所有 IM 广播再按 `_imChatRoomId` 与当前 `chatRoomId` 校验一次，旧聊天室消息不会写入新房间。
   - `resetLocalState()` 同时清理 `_imStatusTimer` / `_imQueueTimer` / `_imChatTimer`。

5. **同一首歌导致旧音源请求落回新房间**
   - `loadAudioForSong()` / `onLevelChange()` 增加 `_roomEpoch` 校验：换房后即使新房间第一首恰好与旧房间相同，旧房间的 `/song/url/v1` 响应和 `onloadedmetadata` 回调也会被丢弃。

6. **缓存**
   - `boot.js` 的 `VERSION` 与所有 `?v=` 升到 **80**，避免 Vercel/浏览器继续使用旧脚本。

验收：真实账号创建私房后重匹配到新的公开房，新房间的首歌/聊天室/聊天记录均来自新 roomId；旧 roomId 的 status 快照、ready 事件、IM 消息均被忽略；本地 headless 用 fake Chatroom 验证旧连接消息不会进入新连接。

# NeteaseCloudMusicApiEnhanced Agent 说明

## 快速开始
- **包管理器**：开发与 CI 使用 `pnpm`，`Dockerfile` 也用 pnpm（`pnpm@9 --frozen-lockfile`，匹配 `pnpm-lock.yaml`）。仓库没有 `yarn.lock`，不要引入 yarn。
- **Node 版本**：README 推荐 Node 22+；`package.json` 的 `engines` 声明 `>=12`；CI/打包在 Node 18–24 上运行。现代 Node 均可。
- **环境变量**：`server.js` 调用了 `dotenv.config()`，本地 `.env` 会被自动加载；所有支持的变量见 `.env.prod.example`。

## 常用命令
- 安装依赖：`pnpm i`
- 启动服务：`pnpm start`（等价 `node app.js`）；热重载开发：`pnpm dev`（nodemon）
- 跑测试：`pnpm test`（Mocha，超时 60s）
- Lint：`pnpm lint`；自动修复：`pnpm lint-fix`
- 文档格式化检查/修复：`pnpm docs:check` / `pnpm docs:format`
- 打包独立二进制：`pnpm pkgwin` / `pkglinux` / `pkgmacos`

## 架构
- `app.js`（也是 `bin`）——服务入口。先确保 `os.tmpdir()` 里存在 `anonymous_token`，执行 `generateConfig()` 刷新匿名 cookie 与 xeapi 公钥，再调用 `server.serveNcmApi()`。
- `server.js`——Express 工厂。`constructServer()` 自动扫描 `module/*.js`，每个文件注册一条路由（文件名 `_` 转 `/`，如 `album_new.js` → `/album/new`；特例 `daily_signin`/`fm_trash`/`personal_fm` 硬编码在 `server.js` 的 `special` 对象里）。`serveNcmApi()` 监听 `PORT`（默认 3000）/`HOST`。
- `main.js`——作为依赖被引入时的入口（`main` 字段）。把每个 `module/*` 导出为同名函数 `name(data)`，另导出 `server`、`serveNcmApi`、`getModulesDefinitions`。
- `module/*.js`——每个接口一个文件，标准写法：`module.exports = (query, request) => request(path, data, createOption(query))`。`createOption` 在 `util/option.js`，负责 crypto、cookie（回退到 `NETEASE_COOKIE`）、proxy、realIP/randomCNIP、headers、timeout。
- `util/request.js`——唯一的对外 HTTP 层（axios）。按 `crypto`（`api`/`eapi`/`weapi`/`linuxapi`/`xeapi`）加密并设置 IP 头；在 require 时同步读取 `os.tmpdir()` 里的 `anonymous_token` 与 `xeapi_public_key`。
- `util/config.json`——运行时配置：网易域名 + `APP_CONF.encrypt: true`（默认走 eapi 加密）。已被 git 跟踪，改动会改变全局默认行为。
- `index.js` / `index.mjs`——`require('./app.js')` 的薄包装，供 Vercel（`vercel.json`）和 ESM 导入使用。
- `server.js` 里有一段非显而易见的逻辑：环境变量 `ENABLE_GENERAL_UNBLOCK=true` 时，`/song/url/v1` 的响应会被自动解灰（走 `@neteasecloudmusicapienhanced/unblockmusic-utils`）；另外 `query.noCookie` 为真时不向响应写 `Set-Cookie`。

## 新增/修改接口
- 新建 `module/xxx.js` 会自动挂载路由，无需注册；**文件名即路由**。
- 照抄同目录模块的写法（选对 `crypto`），用 `createOption(query)` 生成请求选项。
- 改文件名/路由会破坏已有客户端，尽量保持旧路径兼容。

## 测试
- `pnpm test` 跑 `server.test.js` + `main.test.js`。`server.test.js` 在 `before()` 里启动真实服务器，`test/*.test.js` 全部请求**真实网易云 API**——必须联网，且可能因上游风控/限流偶发失败。`main.test.js` 是纯单测，不需要网络。
- **CI 门禁只看稳定项**：`ci-check.yml` 在 Node 18/22/24 上跑 `pnpm lint` + `main.test.js` + `pnpm docs:check`；完整集成测试（`server.test.js`）是 `continue-on-error`，不阻塞合并。本地跑全量测试失败先怀疑上游风控。
- 测试使用 `power-assert`（经 `intelli-espower-loader`），普通 `assert` 写法也会输出详细 diff。
- 只跑单个用例：`pnpm exec mocha -r intelli-espower-loader -t 60000 --grep "<describe/it 名字>" server.test.js main.test.js --exit`
- 只跑离线单测：`pnpm exec mocha -r intelli-espower-loader -t 60000 main.test.js --exit`

## 坑与注意
- **改 `package.json` 的 `version` 会触发自动发布**：`release-on-version-change.yml` 按 paths 过滤——只要 push 到 `main` 时 `package.json` 有改动且 version 变了，就自动打 tag + GitHub Release（`pkg` 三平台二进制）、推送 Docker 镜像（Docker Hub + GHCR 多架构）、`pnpm publish` 到 npm；tag 已存在则跳过。别顺手改版本号，也别往 `package.json` 里写无关改动凑提交。
- **没有实际 git hooks**：`package.json` 里配了 `lint-staged` 和 husky，但 `.husky/` 下只有 `_` 脚手架目录、没有真正的 hook 文件，commit 时不会自动跑任何检查，自己记得 `pnpm lint-fix`。
- **代理环境变量已失效**：README 里关于 `http_proxy`/`https_proxy` 的警告来自旧 `request` 库时代；现在 `util/request.js` 用 axios + 自定义 keep-alive agent，且显式 `proxy: false`，环境变量代理不会生效。按请求走 `query.proxy` 参数（支持 PAC 和 http 隧道）。
- **启动令牌在系统临时目录**：`anonymous_token`、`xeapi_public_key` 存放在 `os.tmpdir()`，`util/request.js` 在 require 时同步读取。文件过期或被清空就重启服务（或调用 `generateConfig()`）；首次启动先写空文件再刷新。
- **ESLint 9 flat config**：`eslint.config.js`，风格由 `eslint-plugin-prettier` 强制（2 空格缩进、单引号、分号、`endOfLine: auto`）。

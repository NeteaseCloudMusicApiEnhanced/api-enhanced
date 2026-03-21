require('dotenv').config()
const fs = require('fs')
const path = require('path')
const express = require('express')
const request = require('./util/request')
const packageJSON = require('./package.json')
const exec = require('child_process').exec
const cache = require('./util/apicache').middleware
const { cookieToJson } = require('./util/index')
const fileUpload = require('express-fileupload')
const decode = require('safe-decode-uri-component')
const logger = require('./util/logger.js')

/**
 * The version check result.
 * @readonly
 * @enum {number}
 */
const VERSION_CHECK_RESULT = {
  FAILED: -1,
  NOT_LATEST: 0,
  LATEST: 1,
}

/**
 * @typedef {{
 *   identifier?: string,
 *   route: string,
 *   module: any
 * }} ModuleDefinition
 */

/**
 * @typedef {{
 *   port?: number,
 *   host?: string,
 *   checkVersion?: boolean,
 *   moduleDefs?: ModuleDefinition[]
 * }} NcmApiOptions
 */

/**
 * @typedef {{
 *   status: VERSION_CHECK_RESULT,
 *   ourVersion?: string,
 *   npmVersion?: string,
 * }} VersionCheckResult
 */

/**
 * @typedef {{
 *  server?: import('http').Server,
 * }} ExpressExtension
 */

/**
 * Get the module definitions dynamically (Recursive version)
 *
 * @param {string} modulesPath The path to modules (JS).
 * @param {Record<string, string>} [specificRoute] The specific route of specific modules.
 * @param {boolean} [doRequire] If true, require() the module directly.
 * @returns {Promise<ModuleDefinition[]>} The module definitions.
 */
async function getModulesDefinitions(
  modulesPath,
  specificRoute,
  doRequire = true,
) {
  const modules = [];

  /**
   * 递归扫描目录内部函数
   * 我们按照 Next.js 的路由结构来实现改造我们的模块系统
   *  - 目录即路由前缀，文件即路由路径
   *  - 例如 module/playlist/detail.js 对应 /playlist/detail 路由
   *  - 目录名中的下划线会被转换成斜杠，例如 module/user/_info.js 对应 /user/info 路由
   *  - 特例：如果目录名被括号包裹，例如 module/(search)/index.js，对应 /search 路由（即括号内的内容会被忽略）
   * @param {string} currentDir 当前所在的目录路径
   * @param {string} basePrefix 累加的路由前缀，会转换会 URL 的一部分，可用 () 决定是否包含该部分
   */
  async function scanDir(currentDir, basePrefix = '/') {
    const files = await fs.promises.readdir(currentDir);

    for (const file of files) {
      const fullPath = path.join(currentDir, file);
      const stat = await fs.promises.stat(fullPath);

      if (stat.isDirectory()) {
        // 判断是否是路由组，例如 "(search)"
        const isGroup = file.startsWith('(') && file.endsWith(')');

        // 工程化细节：URL 路径拼接必须用 path.posix.join，防止在 Windows 下生成 \ 斜杠
        const nextPrefix = isGroup
          ? basePrefix
          : path.posix.join(basePrefix, file);

        // 递归进入子目录
        await scanDir(fullPath, nextPrefix);
      } else if (file.endsWith('.js')) {
        const identifier = file.split('.').shift();
        let route;

        // 1. 优先检查是否有特殊写死的路由映射
        if (specificRoute && file in specificRoute) {
          route = specificRoute[file];
        } else {
          // 2. 正常处理逻辑：文件名下划线转斜杠
          const fileRoutePath = identifier.replace(/_/g, '/');
          // 将文件夹前缀和文件路由拼接，并确保多余的斜杠被清理
          route = path.posix.join(basePrefix, fileRoutePath);
        }

        const moduleDef = doRequire ? require(fullPath) : fullPath;

        // 将结果推入数组，保持和原先一样的数据结构
        modules.push({ identifier, route, module: moduleDef });
      }
    }
  }

  // 从根目录开始执行扫描
  await scanDir(modulesPath);

  // 保持原有的逆序习惯
  return modules.reverse();
}

/**
 * Check if the version of this API is latest.
 *
 * @returns {Promise<VersionCheckResult>} If true, this API is up-to-date;
 * otherwise, this API should be upgraded and you would
 * need to notify users to upgrade it manually.
 */
async function checkVersion() {
  return new Promise((resolve) => {
    exec('npm info NeteaseCloudMusicApiEnhanced version', (err, stdout) => {
      if (!err) {
        let version = stdout.trim()

        /**
         * @param {VERSION_CHECK_RESULT} status
         */
        const resolveStatus = (status) =>
          resolve({
            status,
            ourVersion: packageJSON.version,
            npmVersion: version,
          })

        resolveStatus(
          packageJSON.version < version
            ? VERSION_CHECK_RESULT.NOT_LATEST
            : VERSION_CHECK_RESULT.LATEST,
        )
      } else {
        resolve({
          status: VERSION_CHECK_RESULT.FAILED,
        })
      }
    })
  })
}

function parseCorsAllowOrigins(corsAllowOrigin) {
  if (!corsAllowOrigin) {
    return null
  }

  const origins = corsAllowOrigin
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)

  return origins.length > 0 ? origins : null
}

function getCorsAllowOrigin(allowOrigins, requestOrigin) {
  if (!allowOrigins) {
    return requestOrigin || '*'
  }

  if (allowOrigins.includes('*')) {
    return '*'
  }

  if (requestOrigin && allowOrigins.includes(requestOrigin)) {
    return requestOrigin
  }

  return null
}

/**
 * Construct the server of NCM API.
 *
 * @param {ModuleDefinition[]} [moduleDefs] Customized module definitions [advanced]
 * @returns {Promise<import("express").Express>} The server instance.
 */
async function constructServer(moduleDefs) {
  const app = express()
  const { CORS_ALLOW_ORIGIN } = process.env
  const allowOrigins = parseCorsAllowOrigins(CORS_ALLOW_ORIGIN)
  app.set('trust proxy', true)

  /**
   * Serving static files
   */
  app.use(express.static(path.join(__dirname, 'public')))
  /**
   * CORS & Preflight request
   */
  app.use((req, res, next) => {
    if (req.path !== '/' && !req.path.includes('.')) {
      const corsAllowOrigin = getCorsAllowOrigin(
        allowOrigins,
        req.headers.origin,
      )
      const shouldSetVaryHeader = corsAllowOrigin && corsAllowOrigin !== '*'
      res.set({
        'Access-Control-Allow-Credentials': true,
        ...(corsAllowOrigin
          ? { 'Access-Control-Allow-Origin': corsAllowOrigin }
          : {}),
        ...(shouldSetVaryHeader ? { Vary: 'Origin' } : {}),
        'Access-Control-Allow-Headers': 'X-Requested-With,Content-Type',
        'Access-Control-Allow-Methods': 'PUT,POST,GET,DELETE,OPTIONS',
        'Content-Type': 'application/json; charset=utf-8',
      })
    }
    req.method === 'OPTIONS' ? res.status(204).end() : next()
  })

  /**
   * Cookie Parser
   */
  app.use((req, _, next) => {
    req.cookies = {}
      //;(req.headers.cookie || '').split(/\s*;\s*/).forEach((pair) => { //  Polynomial regular expression //
      ; (req.headers.cookie || '').split(/;\s+|(?<!\s)\s+$/g).forEach((pair) => {
        let crack = pair.indexOf('=')
        if (crack < 1 || crack == pair.length - 1) return
        req.cookies[decode(pair.slice(0, crack)).trim()] = decode(
          pair.slice(crack + 1),
        ).trim()
      })
    next()
  })

  /**
   * Body Parser and File Upload
   */
  const MAX_UPLOAD_SIZE_MB = 500
  const MAX_UPLOAD_SIZE_BYTES = MAX_UPLOAD_SIZE_MB * 1024 * 1024

  app.use(express.json({ limit: `${MAX_UPLOAD_SIZE_MB}mb` }))
  app.use(
    express.urlencoded({ extended: false, limit: `${MAX_UPLOAD_SIZE_MB}mb` }),
  )

  app.use(
    fileUpload({
      limits: {
        fileSize: MAX_UPLOAD_SIZE_BYTES,
      },
      useTempFiles: true,
      tempFileDir: require('os').tmpdir(),
      abortOnLimit: true,
      parseNested: true,
    }),
  )

  /**
   * Cache
   */
  app.use(cache('2 minutes', (_, res) => res.statusCode === 200))

  /**
   * Special Routers
   */
  const special = {
    'daily_signin.js': '/daily_signin',
    'fm_trash.js': '/fm_trash',
    'personal_fm.js': '/personal_fm',
  }

  /**
   * Load every modules in this directory
   */
  const moduleDefinitions =
    moduleDefs ||
    (await getModulesDefinitions(path.join(__dirname, 'module'), special))

  for (const moduleDef of moduleDefinitions) {
    // Register the route.
    app.all(moduleDef.route, async (req, res) => {
      ;[req.query, req.body].forEach((item) => {
        // item may be undefined (some environments / middlewares).
        // Guard access to avoid "Cannot read properties of undefined (reading 'cookie')".
        if (item && typeof item.cookie === 'string') {
          item.cookie = cookieToJson(decode(item.cookie))
        }
      })

      let query = Object.assign(
        {},
        { cookie: req.cookies },
        req.query,
        req.body,
        req.files,
      )

      try {
        const moduleResponse = await moduleDef.module(query, (...params) => {
          // 参数注入客户端IP
          const obj = [...params]
          const options = obj[2] || {}
          if (!options.randomCNIP) {
            let ip = req.ip

            if (ip.substring(0, 7) == '::ffff:') {
              ip = ip.substring(7)
            }
            if (ip == '::1') {
              ip = global.cnIp
            }
            // logger.info('Requested from ip:', ip)
            obj[2] = {
              ...options,
              ip,
            }
          }

          return request(...obj)
        })
        logger.info(`Request Success: ${decode(req.originalUrl)}`)

        // 夹带私货部分：如果开启了通用解锁，并且是获取歌曲URL的接口，则尝试解锁（如果需要的话）ヾ(≧▽≦*)o
        if (
          req.baseUrl === '/song/url/v1' &&
          process.env.ENABLE_GENERAL_UNBLOCK === 'true'
        ) {
          const song = moduleResponse.body.data[0]
          if (
            song.freeTrialInfo !== null ||
            !song.url ||
            [1, 4].includes(song.fee)
          ) {
            const {
              matchID,
            } = require('@neteasecloudmusicapienhanced/unblockmusic-utils')
            logger.info('Starting unblock(uses general unblock):', req.query.id)
            const result = await matchID(req.query.id)
            song.url = result.data.url
            song.freeTrialInfo = null
            logger.info('Unblock success! url:', song.url)
          }
          if (song.url && song.url.includes('kuwo')) {
            const proxy = process.env.PROXY_URL
            const useProxy = process.env.ENABLE_PROXY || 'false'
            if (useProxy === 'true' && proxy) {
              song.proxyUrl = proxy + song.url
            }
          }
        }

        const cookies = moduleResponse.cookie
        if (!query.noCookie) {
          if (Array.isArray(cookies) && cookies.length > 0) {
            if (req.protocol === 'https') {
              // Try to fix CORS SameSite Problem
              res.append(
                'Set-Cookie',
                cookies.map((cookie) => {
                  return cookie + '; SameSite=None; Secure'
                }),
              )
            } else {
              res.append('Set-Cookie', cookies)
            }
          }
        }
        if (moduleResponse.redirectUrl) {
          res.redirect(moduleResponse.status || 302, moduleResponse.redirectUrl)
          return
        }

        res.status(moduleResponse.status).send(moduleResponse.body)
      } catch (/** @type {*} */ moduleResponse) {
        logger.error(`${decode(req.originalUrl)}`, {
          status: moduleResponse.status,
          body: moduleResponse.body,
        })
        if (!moduleResponse.body) {
          res.status(404).send({
            code: 404,
            data: null,
            msg: 'Not Found',
          })
          return
        }
        if (moduleResponse.body.code == '301')
          moduleResponse.body.msg = '需要登录'
        if (!query.noCookie) {
          res.append('Set-Cookie', moduleResponse.cookie)
        }

        res.status(moduleResponse.status).send(moduleResponse.body)
      }
    })
  }

  return app
}

/**
 * Serve the NCM API.
 * @param {NcmApiOptions} options
 * @returns {Promise<import('express').Express & ExpressExtension>}
 */
async function serveNcmApi(options) {
  const port = Number(options.port || process.env.PORT || '3000')
  const host = options.host || process.env.HOST || ''

  const checkVersionSubmission =
    options.checkVersion &&
    checkVersion().then(({ npmVersion, ourVersion, status }) => {
      if (status == VERSION_CHECK_RESULT.NOT_LATEST) {
        logger.info(
          `最新版本: ${npmVersion}, 当前版本: ${ourVersion}, 请及时更新`,
        )
      }
    })
  const constructServerSubmission = constructServer(options.moduleDefs)

  const [_, app] = await Promise.all([
    checkVersionSubmission,
    constructServerSubmission,
  ])

  /** @type {import('express').Express & ExpressExtension} */
  const appExt = app
  appExt.server = app.listen(port, host, () => {

    console.log(`\x1b[31m
    ███╗   ██╗███████╗████████╗███████╗ █████╗ ███████╗███████╗  █████╗ ██████╗ ██╗
    ████╗  ██║██╔════╝╚══██╔══╝██╔════╝██╔══██╗██╔════╝██╔════╝ ██╔══██╗██╔══██╗██║
    ██╔██╗ ██║█████╗     ██║   █████╗  ███████║███████╗█████╗   ███████║██████╔╝██║
    ██║╚██╗██║██╔══╝     ██║   ██╔══╝  ██╔══██║╚════██║██╔══╝   ██╔══██║██╔═══╝ ██║
    ██║ ╚████║███████╗   ██║   ███████╗██║  ██║███████║███████╗ ██║  ██║██║     ██║
    ╚═╝  ╚═══╝╚══════╝   ╚═╝   ╚══════╝╚═╝  ╚═╝╚══════╝╚══════╝ ╚═╝  ╚═╝╚═╝     ╚═╝
    \x1b[0m`)

    logger.info(`
    - Server started successfully @ http://${host ? host : 'localhost'}:${port}
    - Environment: ${process.env.NODE_ENV || 'development'}
    - Node Version: ${process.version}
    - Process ID: ${process.pid}`
    )
  })

  return appExt
}

module.exports = {
  serveNcmApi,
  getModulesDefinitions,
}

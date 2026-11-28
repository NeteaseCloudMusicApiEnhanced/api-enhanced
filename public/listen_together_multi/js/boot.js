/**
 * 依赖加载器
 *
 * 页面不再直接引用 CDN 脚本：先按顺序尝试 jsDelivr → unpkg，全部失败时渲染
 * 可重试的错误面板，而不是白屏。依赖就绪后再按固定顺序加载业务脚本。
 */
;(function () {
  'use strict'

  var VERSION = '88'
  var BASES = ['https://fastly.jsdelivr.net/npm/', 'https://unpkg.com/']

  var DEPS = [
    {
      name: 'Vue',
      local: 'vendor/vue.global.prod.js',
      file: 'vue@3.5.46/dist/vue.global.prod.js',
      ready: function () {
        return typeof window.Vue !== 'undefined'
      },
    },
    {
      name: 'axios',
      local: 'vendor/axios.min.js',
      file: 'axios@0.26.1/dist/axios.min.js',
      ready: function () {
        return typeof window.axios !== 'undefined'
      },
    },
  ]

  var ICONS = '@fortawesome/fontawesome-free@6.7.2/css/all.min.css'

  var SCRIPTS = [
    'js/core.js',
    'js/stickers.js',
    'js/state.js',
    'js/computed.js',
    'js/methods/common.js',
    'js/methods/api.js',
    'js/methods/room.js',
    'js/methods/match.js',
    'js/methods/stickers.js',
    'js/methods/songs.js',
    'js/methods/queue.js',
    'js/methods/playlists.js',
    'js/methods/preview.js',
    'js/methods/lyrics.js',
    'js/methods/chat.js',
    'js/methods/invite.js',
    'js/methods/ui.js',
    'js/components/shell.js',
    'js/components/room.js',
    'js/components/chat.js',
    'js/components/overlays.js',
    'js/mounted.js',
    'js/mock.js',
    'js/app.js',
  ]

  function inject(src) {
    return new Promise(function (resolve, reject) {
      var el = document.createElement('script')
      el.src = src
      el.async = false
      el.onload = function () {
        resolve(src)
      }
      el.onerror = function () {
        reject(new Error(src))
      }
      document.head.appendChild(el)
    })
  }

  function injectCss(href) {
    return new Promise(function (resolve, reject) {
      var el = document.createElement('link')
      el.rel = 'stylesheet'
      el.href = href
      el.onload = function () {
        resolve(href)
      }
      el.onerror = function () {
        reject(new Error(href))
      }
      document.head.appendChild(el)
    })
  }

  function loadCss(file) {
    var index = 0
    function attempt() {
      if (index >= BASES.length) {
        return Promise.reject(new Error('样式加载失败'))
      }
      return injectCss(BASES[index++] + file).catch(attempt)
    }
    return attempt()
  }

  function loadOne(file, label) {
    var index = 0
    function attempt() {
      if (index >= BASES.length) {
        return Promise.reject(new Error(label + ' 加载失败'))
      }
      var url = BASES[index++] + file
      return inject(url).catch(attempt)
    }
    return attempt()
  }

  function loadDep(dep) {
    // 优先同源 vendor（Cloudflare/浏览器可长期缓存），失败再回退公共 CDN
    var local = '/listen_together_multi/' + dep.local + '?v=' + VERSION
    return inject(local).catch(function () {
      return loadOne(dep.file, dep.name)
    })
  }

  function fatal(message, detail) {
    var app = document.getElementById('app')
    if (!app) return
    app.innerHTML =
      '<div class="lt-boot-error" role="alert">' +
      '<h1>页面资源加载失败</h1>' +
      '<p>' +
      message +
      '</p>' +
      '<p class="lt-boot-error__detail">' +
      (detail || '') +
      '</p>' +
      '<div class="lt-boot-error__actions">' +
      '<button onclick="location.reload()">重新加载</button>' +
      '</div>' +
      '<p class="lt-boot-error__hint">Vue / axios 优先使用站点 vendor，失败后回退到公共 CDN（jsDelivr、unpkg）。' +
      '如果网络无法访问，请检查站点静态资源或 CDN 可用性。</p>' +
      '</div>'
  }

  function boot() {
    // 图标样式与业务脚本互不依赖，失败也不阻塞页面
    loadCss(ICONS).catch(function () {
      return null
    })

    Promise.all(
      DEPS.map(function (dep) {
        if (dep.ready()) return null
        return loadDep(dep)
      }),
    )
      .then(function () {
        if (
          !DEPS.every(function (dep) {
            return dep.ready()
          })
        ) {
          throw new Error('依赖未初始化')
        }
        // 所有业务脚本一次性插入：浏览器并行下载，async=false 保证按顺序执行，
        // 不再像以前那样每个脚本都等上一个 onload。
        return Promise.all(
          SCRIPTS.map(function (path) {
            return inject('/listen_together_multi/' + path + '?v=' + VERSION)
          }),
        )
      })
      .catch(function (error) {
        fatal(
          'Dependency load failed: ' +
            (error && error.message ? error.message : error),
          '请检查网络或 CDN 可用性后重试。',
        )
      })
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot)
  } else {
    boot()
  }
})()

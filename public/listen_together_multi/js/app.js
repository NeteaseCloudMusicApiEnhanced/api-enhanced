/**
 * 应用入口：把共享 store（state/computed/methods）注入根组件与所有视图组件
 *
 * 视图组件不各自持有一份状态，而是复用同一个响应式对象，避免层层传 props。
 */
;(function () {
  'use strict'

  const LT = window.LT
  const {
    createState,
    computed,
    mounted,
    commonMethods,
    roomMethods,
    matchMethods,
    stickersMethods,
    songsMethods,
    lyricsMethods,
    chatMethods,
    queueMethods,
    playlistsMethods,
    previewMethods,
    inviteMethods,
    uiMethods,
    components,
  } = LT

  if (typeof Vue === 'undefined') {
    document.getElementById('app').innerHTML =
      '<div class="lt-boot-error"><h1>Vue 未加载</h1><p>请刷新页面重试。</p></div>'
    return
  }

  try {
    const mockParam = new URLSearchParams(location.search).get('mock')
    LT.MOCK = mockParam === null ? false : mockParam || '1'
  } catch (e) {
    LT.MOCK = false
  }

  const state = createState()

  if (LT.MOCK) {
    state.mockMode = true
    if (LT.applyMock) LT.applyMock(state, LT.MOCK)
  }

  const methods = Object.assign(
    {},
    commonMethods,
    roomMethods,
    matchMethods,
    stickersMethods,
    songsMethods,
    lyricsMethods,
    chatMethods,
    queueMethods,
    playlistsMethods,
    previewMethods,
    inviteMethods,
    uiMethods,
  )

  const REQUIRED_METHODS = [
    'handleImMessage',
    'applyImPlayState',
    'applyImOperate',
    'applyImMembers',
    'appendImChatMessage',
    'appendChatMessage',
    'recomputeRoomUsers',
    'onChatScroll',
    'scrollChat',
    'jumpChatToBottom',
    'onPickerScroll',
    'goChat',
    'onQualitySelect',
    'loadMyPlaylists',
    'addSongToPlaylist',
    'openCollectSheet',
  ]
  const missing = REQUIRED_METHODS.filter(
    (name) => typeof methods[name] !== 'function',
  )
  if (missing.length) {
    LT.log('app', '缺少关键方法', missing.join(','))
    console.error('[listen-together] 缺少关键方法:', missing)
  }

  const shared = {
    data: () => state,
    computed,
    methods,
  }

  const app = Vue.createApp(
    Object.assign({ template: '#tpl-app', mounted }, shared),
  )

  Object.entries(components || {}).forEach(([name, definition]) => {
    app.component(name, Object.assign({}, shared, definition))
  })

  try {
    window.LT.vm = app.mount('#app')
  } catch (error) {
    console.error('[listen-together] mount failed', error)
    const host = document.getElementById('app')
    if (host) {
      host.innerHTML =
        '<div class="lt-boot-error"><h1>页面初始化失败</h1><p>' +
        String(error && error.message ? error.message : error) +
        '</p><div class="lt-boot-error__actions"><button onclick="location.reload()">重新加载</button></div></div>'
    }
  }
})()

;(function () {
  'use strict'

  const { api, log, util, AUDIO_LEVELS, LOG_LEVELS } = window.LT

  const commonMethods = {
    async init() {
      try {
        await this.login(true)
      } catch (e) {
        log('error', 'App', '初始化异常', e)
      }
    },

    getFakeAndroidCookie() {
      return 'os=android; appver=9.1.65; osver=14; channel=xiaomi'
    },

    /* ---------------- 反馈 ---------------- */

    toast(text, type = 'info', ttl = 2400) {
      const value = String(text == null ? '' : text).trim()
      if (!value) return
      this.toasts.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        text: value,
        type,
      })
      if (this.toasts.length > 4) this.toasts.splice(0, this.toasts.length - 4)
      setTimeout(() => {
        const index = this.toasts.findIndex(
          (item) => item.text === value && item.type === type,
        )
        if (index >= 0) this.toasts.splice(index, 1)
      }, ttl)
    },

    /* ---------------- 复制 ---------------- */

    async copyText(text, label = '内容') {
      if (!text) {
        this.toast(`没有可复制的${label}`, 'warn')
        return false
      }
      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(String(text))
        } else {
          const ta = document.createElement('textarea')
          ta.value = String(text)
          ta.style.position = 'fixed'
          ta.style.top = '-1000px'
          ta.style.opacity = '0'
          document.body.appendChild(ta)
          ta.focus()
          ta.select()
          const ok = document.execCommand('copy')
          document.body.removeChild(ta)
          if (!ok) throw new Error('execCommand 失败')
        }
        this.message = `${label}已复制`
        this.toast(`${label}已复制`, 'ok')
        return true
      } catch (e) {
        this.message = `复制失败，请手动复制${label}`
        this.toast(`复制失败，请手动复制${label}`, 'error')
        return false
      }
    },

    async copyShareLink() {
      if (!this.shareUrl) {
        this.toast('当前不在房间中', 'warn')
        return
      }
      await this.copyText(this.shareUrl, '分享链接')
    },

    /* ---------------- 刷新 ---------------- */

    async refreshRoom() {
      if (!this.roomInfo.roomId || this.refreshing) return
      this.refreshing = true
      try {
        await this.fetchStatus()
        await this.fetchChat()
        this.toast('房间状态已刷新', 'ok')
      } catch (e) {
        this.toast('刷新失败：' + (e.message || e), 'error')
      } finally {
        this.refreshing = false
      }
    },

    /* ---------------- 用户 ---------------- */

    userUid(u) {
      return util.uidOf(u)
    },

    initialOf(name) {
      return util.initialOf(name)
    },

    /** IM 快照是主来源，HTTP 快照只补充 IM 没下发的成员，避免互相覆盖 */
    recomputeRoomUsers() {
      const merged = new Map()
      for (const user of this._imMembers || []) {
        const uid = util.uidOf(user)
        if (uid !== '') merged.set(String(uid), user)
      }
      for (const user of this._httpMembers || []) {
        const uid = util.uidOf(user)
        if (uid === '') continue
        if (!merged.has(String(uid))) merged.set(String(uid), user)
      }
      for (const user of this._landingMembers || []) {
        const uid = util.uidOf(user)
        if (uid === '') continue
        if (!merged.has(String(uid))) merged.set(String(uid), user)
      }
      this.roomInfo.roomUsers = [...merged.values()]
    },

    img(url, size = 0) {
      return util.imageUrl(url, size)
    },

    isMe(u) {
      const uid = this.userUid(u)
      return (
        uid !== '' &&
        String(uid) === String(this.account.userId) &&
        this.account.userId
      )
    },

    isMeUid(uid) {
      return (
        !!uid &&
        !!this.account.userId &&
        String(uid) === String(this.account.userId)
      )
    },

    songSource(song) {
      const uid = Number(song?.songRcmdUid ?? song?.rcmdUid ?? 0)
      if (!uid) return { type: 'sys', label: '系统推荐', isMine: false, uid: 0 }
      if (String(uid) === String(this.account.userId)) {
        return { type: 'mine', label: '我点的', isMine: true, uid }
      }
      const name = this.userNameCache[String(uid)]
      return {
        type: 'other',
        label: name || `UID ${uid}`,
        isMine: false,
        uid,
      }
    },

    levelLabel(key) {
      const found = AUDIO_LEVELS.find((level) => level.key === key)
      return found ? found.label : key
    },

    /* ---------------- 时间 ---------------- */

    formatRelativeTime(value) {
      return util.formatRelativeTime(value)
    },

    dayLabel(value) {
      return util.dayLabel(value)
    },

    formatAudioTime(value) {
      return util.formatClock(value)
    },

    /* ---------------- 聊天视图 ---------------- */

    setPane(pane) {
      const next = ['stage', 'queue', 'chat'].includes(pane) ? pane : 'stage'
      // 沉浸模式只展示舞台：切到其他分区时先退出沉浸，避免内容区全空
      if (this.immersive && next !== 'stage') this.immersive = false
      this.pane = next
      this.chatOpen = next === 'chat' || this.isWideViewport()
      if (next === 'chat') this.openChat()
    },

    isWideViewport() {
      return typeof window !== 'undefined' && window.innerWidth >= 1024
    },

    goChat() {
      if (this.immersive) this.immersive = false
      this.setPane('chat')
    },

    toggleChat() {
      if (this.isWideViewport()) {
        this.setPane(this.pane === 'chat' ? 'stage' : 'chat')
        return
      }
      if (this.pane === 'chat') this.setPane('stage')
      else this.setPane('chat')
    },

    openChat() {
      this.chatOpen = true
      this.chatTab = 'chat'
      this.chatUnread = 0
      this.chatUnreadAnchor = ''
      this.scrollChat(true)
    },

    closeChat() {
      this.chatOpen = false
      if (this.pane === 'chat') this.pane = 'stage'
    },

    setChatTab(tab) {
      this.chatTab = tab === 'logs' ? 'logs' : 'chat'
      if (this.chatTab === 'logs') this.scrollLogs()
      else this.scrollChat()
    },

    scrollChat(force = false) {
      this.$nextTick(() => {
        const el = document.getElementById('chatList')
        if (!el) return
        if (force || this.chatAtBottom) el.scrollTop = el.scrollHeight
      })
    },

    scrollLogs() {
      this.$nextTick(() => {
        const el = document.getElementById('logList')
        if (el) el.scrollTop = el.scrollHeight
      })
    },

    /* ---------------- 日志 ---------------- */

    pushLog(level, module, msg, data = '') {
      // 兼容旧的 pushLog(tag, msg, data)
      if (!LOG_LEVELS[level]) {
        data = arguments.length > 2 ? msg : ''
        msg = module
        module = level
        level = 'info'
      }
      const text = String(msg || '')
      if (!text) return
      const normalizedLevel = LOG_LEVELS[level] ? level : 'info'
      const normalizedModule =
        window.LT.normalizeLogModule?.(module) || String(module || 'App')
      const last = this.logEntries[this.logEntries.length - 1]
      if (
        last &&
        last.module === normalizedModule &&
        last.msg === text &&
        last.level === normalizedLevel
      )
        return
      this.logEntries.push({
        time: Date.now(),
        level: normalizedLevel,
        module: normalizedModule,
        tag: normalizedModule,
        msg: text,
        data: typeof data === 'string' ? data : '',
      })
      if (this.logEntries.length > 1000)
        this.logEntries.splice(0, this.logEntries.length - 1000)
      if (this.chatTab === 'logs') this.scrollLogs()
    },

    onLogEvent(event) {
      if (!event?.detail) return
      const detail = event.detail
      const entry = Object.assign({}, detail, {
        level: LOG_LEVELS[detail.level] ? detail.level : 'info',
        module: detail.module || detail.tag || 'App',
      })
      this.logEntries.push(entry)
      if (this.logEntries.length > 1000)
        this.logEntries.splice(0, this.logEntries.length - 1000)
      if (this.chatTab === 'logs') this.scrollLogs()
    },

    logTime(time) {
      return new Date(time || Date.now()).toLocaleTimeString()
    },

    logLevelLabel(level) {
      return LOG_LEVELS[level]?.label || '信息'
    },

    toggleLogLevel(level) {
      if (!LOG_LEVELS[level]) return
      this.logLevelFilters = Object.assign({}, this.logLevelFilters, {
        [level]: this.logLevelFilters[level] === false,
      })
    },

    setLogModuleFilter(module) {
      this.logModuleFilter = module || 'all'
    },

    clearLogs() {
      this.logEntries = []
      if (Array.isArray(window.LT.logs)) window.LT.logs.length = 0
    },

    /* ---------------- 消息渲染 ---------------- */

    formatMessageText(text) {
      const raw = String(text || '')
      let html = util.escapeHtml(raw)
      const names = (this.roomInfo.roomUsers || [])
        .map((user) => String(user.nickname || ''))
        .filter(Boolean)
        .sort((a, b) => b.length - a.length)
      for (const name of names.slice(0, 50)) {
        const safe = util.escapeHtml(name)
        html = html
          .split(`@${safe}`)
          .join(`<span class="lt-msg__mention">@${safe}</span>`)
      }
      return html.replace(/\n/g, '<br>')
    },

    /* ---------------- 诊断 ---------------- */

    exportDiagnostics() {
      const payload = {
        exportedAt: new Date().toISOString(),
        url: location.href,
        userAgent: navigator.userAgent,
        account: {
          uid: this.account.userId,
          nickname: this.account.nickname,
          login: this.account.login,
        },
        room: {
          roomId: this.roomInfo.roomId,
          chatRoomId: this.roomInfo.chatRoomId,
          roomType: this.roomInfo.roomType,
          roomBizType: this.roomInfo.roomBizType,
          memberCount: this.roomInfo.roomUsers.length,
        },
        player: {
          songId: this.playingInfo.songId,
          bizId: this.playingInfo.bizId,
          version: this.playingInfo.version,
          level: this.audioLevel,
          actualLevel: this.playingInfo.actualLevel,
        },
        connection: {
          sync: this.syncState,
          isPolling: this.isPolling,
          consecutiveFailures: this.consecutiveFailures,
          imConnected: this.imConnected,
          sse: this.sync.sse,
        },
        logs: this.logEntries.slice(-1000).map((entry) => ({
          time: new Date(entry.time).toISOString(),
          level: entry.level,
          module: entry.module,
          tag: entry.tag,
          msg: entry.msg,
          data: entry.data,
          payload: entry.payload,
        })),
      }
      try {
        const blob = new Blob([JSON.stringify(payload, null, 2)], {
          type: 'application/json',
        })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `listen-together-diagnostics-${Date.now()}.json`
        document.body.appendChild(a)
        a.click()
        a.remove()
        setTimeout(() => URL.revokeObjectURL(url), 2000)
        this.toast('诊断已导出', 'ok')
      } catch (e) {
        this.toast('导出失败：' + e.message, 'error')
      }
    },

    /* ---------------- 供所有方法安全调用的空实现 ---------------- */
    noop() {},
  }

  window.LT.commonMethods = commonMethods
})()

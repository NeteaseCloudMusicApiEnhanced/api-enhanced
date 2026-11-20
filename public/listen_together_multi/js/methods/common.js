(function () {
const { api, log, safeStorage, HEARTBEAT_INTERVAL, STATUS_INTERVAL, MATCH_POLL_INTERVAL, CHAT_INTERVAL, TICK_INTERVAL, REQ_TIMEOUT, CHAT_PAGE_SIZE, AUDIO_LEVELS, DEFAULT_AUDIO_LEVEL, LISTEN_STICKERS, loadSavedStickers } = window.LT
const commonMethods = {
  async init() {
              try {
                await this.login(true)
              } catch (e) {
                log('Init', '初始化异常', e)
              }
            },

  getFakeAndroidCookie() {
              return 'os=android; appver=9.1.65; osver=14; channel=xiaomi'
            },

  async copyText(text, label = '内容') {
              if (!text) return (this.message = `没有可复制的${label}`)
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
              } catch (e) {
                this.message = `复制失败，请手动复制${label}`
              }
            },

  async copyShareLink() {
              if (!this.shareUrl) return (this.message = '当前不在房间中')
              await this.copyText(this.shareUrl, '分享链接')
            },

  async refreshRoom() {
              if (!this.roomInfo.roomId || this.refreshing) return
              this.refreshing = true
              try {
                await this.fetchStatus()
                await this.fetchChat()
                this.message = '房间状态已刷新'
              } catch (e) {
                this.message = '刷新失败: ' + (e.message || e)
              } finally {
                this.refreshing = false
              }
            },

  userUid(u) {
              if (!u) return ''
              return u.uid ?? u.userId ?? u.userID ?? u.id ?? ''
            },

  isMe(u) {
              const uid = this.userUid(u)
              return (
                uid !== '' &&
                String(uid) === String(this.account.userId) &&
                this.account.userId
              )
            },

  songSource(song) {
              const uid = Number(song?.songRcmdUid ?? song?.rcmdUid ?? 0)
              if (!uid)
                return { type: 'sys', label: '系统推荐', isMine: false, uid: 0 }
              if (String(uid) === String(this.account.userId))
                return { type: 'mine', label: '我点的', isMine: true, uid }
              const name = this.userNameCache[String(uid)]
              return {
                type: 'other',
                label: name || `UID ${uid}`,
                isMine: false,
                uid,
              }
            },

  levelLabel(key) {
              const found = AUDIO_LEVELS.find((l) => l.key === key)
              return found ? found.label : key
            },

  clampChatButton(x, y) {
    const size = 58
    const margin = 8
    const width = Number(window.innerWidth) || 1024
    const height = Number(window.innerHeight) || 768
    return {
      x: Math.min(Math.max(margin, Number(x) || 0), Math.max(margin, width - size - margin)),
      y: Math.min(Math.max(margin, Number(y) || 0), Math.max(margin, height - size - margin)),
    }
  },

  saveChatButtonPos() {
    safeStorage.set('chat_button_pos', JSON.stringify(this.chatButtonPos))
  },

  startChatDrag(event) {
    if (event.button !== undefined && event.button !== 0) return
    const position = this.chatButtonPos || { x: 0, y: 0 }
    this._chatDrag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x: position.x,
      y: position.y,
      moved: false,
    }
    this.chatDragging = true
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch (e) {}
    event.preventDefault()
  },

  onChatDrag(event) {
    const drag = this._chatDrag
    if (!drag) return
    const dx = event.clientX - drag.startX
    const dy = event.clientY - drag.startY
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) drag.moved = true
    if (!drag.moved) return
    this.chatButtonPos = this.clampChatButton(drag.x + dx, drag.y + dy)
  },

  endChatDrag(event) {
    const drag = this._chatDrag
    if (!drag) return
    try {
      event.currentTarget.releasePointerCapture(drag.pointerId)
    } catch (e) {}
    this._chatDrag = null
    this.chatDragging = false
    this.chatButtonPos = this.clampChatButton(
      this.chatButtonPos.x,
      this.chatButtonPos.y,
    )
    this.saveChatButtonPos()
    if (!drag.moved) this.toggleChat()
  },

  cancelChatDrag() {
    this._chatDrag = null
    this.chatDragging = false
  },

  onChatResize() {
    this.viewportWidth = Number(window.innerWidth) || 1024
    this.viewportHeight = Number(window.innerHeight) || 768
    if (!this.chatButtonPos) return
    this.chatButtonPos = this.clampChatButton(
      this.chatButtonPos.x,
      this.chatButtonPos.y,
    )
    this.saveChatButtonPos()
  },

  toggleChat() {
    if (this.chatOpen) this.closeChat()
    else this.openChat()
  },

  openChat() {
    this.chatOpen = true
    this.chatTab = 'chat'
    this.chatUnread = 0
    this.scrollChat()
  },

  closeChat() {
    this.chatOpen = false
  },

  setChatTab(tab) {
    this.chatTab = tab === 'logs' ? 'logs' : 'chat'
    if (this.chatTab === 'logs') this.scrollLogs()
    else this.scrollChat()
  },

  pushLog(tag, msg, data = '') {
    const text = String(msg || '')
    if (!text) return
    const last = this.logEntries[this.logEntries.length - 1]
    if (last && last.tag === tag && last.msg === text) return
    this.logEntries.push({
      time: Date.now(),
      tag: String(tag || 'log'),
      msg: text,
      data: typeof data === 'string' ? data : '',
    })
    if (this.logEntries.length > 300)
      this.logEntries.splice(0, this.logEntries.length - 300)
    if (this.chatTab === 'logs') this.scrollLogs()
  },

  onLogEvent(event) {
    if (!event?.detail) return
    this.logEntries.push(event.detail)
    if (this.logEntries.length > 300)
      this.logEntries.splice(0, this.logEntries.length - 300)
    if (this.chatTab === 'logs') this.scrollLogs()
  },

  logTime(time) {
    return new Date(time || Date.now()).toLocaleTimeString()
  },

  clearLogs() {
    this.logEntries = []
    if (window.LT && Array.isArray(window.LT.logs)) window.LT.logs.length = 0
  },

  scrollChat() {
    this.$nextTick(() => {
      const el = document.getElementById('chatList')
      if (el) el.scrollTop = el.scrollHeight
    })
  },

  scrollLogs() {
    this.$nextTick(() => {
      const el = document.getElementById('logList')
      if (el) el.scrollTop = el.scrollHeight
    })
  },
}

window.LT.commonMethods = commonMethods
})()

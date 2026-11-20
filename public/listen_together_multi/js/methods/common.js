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

}

window.LT.commonMethods = commonMethods
})()

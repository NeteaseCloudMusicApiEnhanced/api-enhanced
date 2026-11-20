(function () {
const { api, log, safeStorage, HEARTBEAT_INTERVAL, STATUS_INTERVAL, MATCH_POLL_INTERVAL, CHAT_INTERVAL, TICK_INTERVAL, REQ_TIMEOUT, CHAT_PAGE_SIZE, AUDIO_LEVELS, DEFAULT_AUDIO_LEVEL, LISTEN_STICKERS, loadSavedStickers } = window.LT
const matchMethods = {
  async startMatch() {
              this.message = '正在重置匹配状态...'
              try {
                await api({
                  url: `/listentogether/multi/match/cancel`,
                  method: 'post',
                  data: { cookie: this.getFakeAndroidCookie() },
                })
              } catch (e) {}
              this.message = '正在连接匹配通知...'
              const songId = this.selectedSongId || 1372188635
              this.closeMatchEvents()
              this._matchSongId = songId
              this._matchRequested = false
              const events = new EventSource(
                `/listentogether/multi/match/events?timestamp=${Date.now()}`,
              )
              this._matchEvents = events
              events.onmessage = (e) => {
                try {
                  this.handleMatchEvent(JSON.parse(e.data))
                } catch (err) {}
              }
              events.onerror = () => {
                if (this._matchEvents !== events) return
                if (this.isMatching)
                  this.message = '匹配通知连接中断，正在重连...'
              }
              events.onopen = () => {
                if (this._matchEvents !== events) return
                if (!this.isMatching) this._matchRequested = false
                this.message = '匹配通知已建立，等待 mini NIM 登录...'
              }
            },

  async requestMatch() {
              if (this._matchRequested) return
              this._matchRequested = true
              const songId = this._matchSongId || 1372188635
              this.message = '匹配通知已登录，正在进入匹配池...'
              try {
                const res = await api({
                  url: `/listentogether/multi/match`,
                  method: 'post',
                  data: {
                    songId,
                    cookie: this.getFakeAndroidCookie(),
                  },
                })
                if (res.data.code === 200) {
                  this.isMatching = true
                  this.message = '匹配中，等待分配房间...'
                  this.startPolling()
                  this.matchTimeoutTimer = setTimeout(() => {
                    if (this.isMatching) {
                      this.cancelMatch()
                      this.message = '匹配超时，请重试'
                    }
                  }, 35000)
                } else {
                  this.message = '匹配失败: ' + res.data.message
                  this.closeMatchEvents()
                }
              } catch (error) {
                this.message =
                  '匹配接口异常: ' +
                  (error.response?.data?.message || error.message)
                this.closeMatchEvents()
              }
            },

  closeMatchEvents() {
              if (this._matchEvents) {
                try {
                  this._matchEvents.close()
                } catch (e) {}
                this._matchEvents = null
              }
            },

  async handleMatchEvent(event) {
              if (!event || typeof event !== 'object') return
              if (event.type === 'connected') {
                if (!this._matchEvents) return
                await this.requestMatch()
                return
              }
              if (event.type === 'ready') {
                if (!event.roomId) return
                this.isMatching = false
                clearTimeout(this.matchTimeoutTimer)
                this.closeMatchEvents()
                this.message = '已找到房间，正在加入...'
                await this.acceptMatch(event.roomId)
                return
              }
              if (event.type === 'failed') {
                this.isMatching = false
                clearTimeout(this.matchTimeoutTimer)
                this.closeMatchEvents()
                this.message = '官方匹配未成功: ' + (event.reason || 'MATCH_FAILED')
                return
              }
              if (
                event.type === 'timeout' ||
                event.type === 'error' ||
                event.type === 'closed'
              ) {
                this.isMatching = false
                clearTimeout(this.matchTimeoutTimer)
                this.closeMatchEvents()
                this.message =
                  event.type === 'error'
                    ? '匹配通知失败: ' + (event.message || 'unknown')
                    : '匹配通知已断开，请重试'
              }
            },

  async acceptMatch(roomId) {
              try {
                const res = await api({
                  url: '/listentogether/multi/match/ack',
                  method: 'post',
                  data: {
                    roomId,
                    inviterUid: 0,
                    agree: true,
                    cookie: this.getFakeAndroidCookie(),
                  },
                })
                const snapshot = res.data.data?.multiLtRoomSnapshot
                if (res.data.code === 200 && snapshot) {
                  this.roomInfo.roomId = snapshot.multiRoomInfoDTO.roomId
                  this.roomInfo.creatorId =
                    snapshot.multiRoomInfoDTO.creatorId
                  this.roomInfo.chatRoomId =
                    snapshot.multiRoomInfoDTO.chatRoomId || ''
                  this.roomInfo.roomBizType =
                    snapshot.multiRoomInfoDTO.roomBizType
                  this.roomInfo.roomType =
                    snapshot.multiRoomInfoDTO.roomType
                  this.message = '匹配成功，已进入房间'
                  await this.fetchStatus()
                  if (!this.isPolling) this.startPolling()
                } else {
                  this.message =
                    '加入房间失败: ' + (res.data.message || '未知错误')
                }
              } catch (error) {
                this.message =
                  '加入房间异常: ' +
                  (error.response?.data?.message || error.message)
              }
            },

  async cancelMatch() {
              this.message = '正在取消匹配...'
              this.closeMatchEvents()
              try {
                await api({
                  url: `/listentogether/multi/match/cancel`,
                  method: 'post',
                  data: { cookie: this.getFakeAndroidCookie() },
                })
              } catch (error) {}
              this.isMatching = false
              clearTimeout(this.matchTimeoutTimer)
              this.stopPolling()
              this.message = '已取消匹配'
            },

  loadChatroomSdk() {
              if (window.Chatroom) return Promise.resolve()
              return new Promise((resolve, reject) => {
                const script = document.createElement('script')
                script.src =
                  'https://fastly.jsdelivr.net/npm/@yxim/nim-web-sdk@9.21.19/dist/SDK/NIM_Web_Chatroom.js'
                script.onload = () => resolve()
                script.onerror = () => reject(new Error('加载 NIM Chatroom SDK 失败'))
                document.head.appendChild(script)
              })
            },

  async toggleImMembers() {
              if (this.imConnected) {
                try {
                  this._imChatroom && this._imChatroom.disconnect()
                } catch (e) {}
                this._imChatroom = null
                this.imConnected = false
                this.imStatus = '已断开'
                return
              }
              if (!this.roomInfo.chatRoomId)
                return (this.imStatus = '当前没有 ChatRoom ID')
              this.imStatus = '获取聊天室凭据…'
              try {
                const res = await api({
                  url: '/listentogether/multi/chatroom/token',
                  method: 'post',
                  data: {
                    roomId: this.roomInfo.chatRoomId,
                    cookie: this.getFakeAndroidCookie(),
                  },
                })
                const data = res.data && res.data.data
                if (res.data.code !== 200 || !data || !data.token)
                  throw new Error((res.data && res.data.message) || '未取得聊天室凭据')
                this.imStatus = '加载 IM SDK…'
                await this.loadChatroomSdk()
                this.imStatus = '连接聊天室…'
                const chatroom = window.Chatroom.getInstance({
                  appKey: '3a6a3e48f6854dfa4e4464f3bdaec3b4',
                  account: data.accId,
                  token: data.token,
                  chatroomId: this.roomInfo.chatRoomId,
                  chatroomNick: 'api-enhanced-demo',
                  chatroomAvatar: ' ',
                  autoconnect: false,
                  chatroomAddresses: [
                    'chatwl01.yunxinfw.com:443',
                    'chatwl02.yunxinfw.com:443',
                  ],
                  secure: true,
                  // 浏览器版默认协商二进制 NIM 帧；演示页强制 JSON，
                  // 这样 DevTools 的 WebSocket 帧可以直接看到明文 JSON。
                  binaryWebsocket: false,
                  onconnect: () => {
                    this.imConnected = true
                    this.imStatus = 'IM 已连接，等待 30005'
                  },
                  ondisconnect: (err) => {
                    this.imConnected = false
                    this.imStatus =
                      'IM 断开: ' + ((err && err.message) || 'unknown')
                  },
                  onerror: (err) => {
                    this.imStatus = 'IM 错误: ' + ((err && err.message) || 'unknown')
                  },
                  onmsgs: (msgs) => {
                    for (const msg of msgs || []) {
                      let custom = msg.custom
                      if (typeof custom === 'string') {
                        try {
                          custom = JSON.parse(custom)
                        } catch (e) {}
                      }
                      const ext = custom && custom.serverExt
                      if (!ext || Number(ext.type) !== 30005 || !ext.content)
                        continue
                      const users = ext.content.onlineUserInfos
                      if (Array.isArray(users)) {
                        this.roomInfo.roomUsers = users.map((u) => ({
                          uid: u.uid,
                          nickname: u.nickname || '听友',
                          avatar: u.avatar || '',
                        }))
                        this.imStatus = `IM 实时成员 ${users.length} 人（30005）`
                      }
                    }
                  },
                })
                this._imChatroom = chatroom
              } catch (e) {
                this.imConnected = false
                const message = e.message || String(e)
                this.imStatus = /clientip|414/.test(message)
                  ? 'IM 连接失败：API 出口 IP 被云信判定为内网/代理（yunxinCode 414），请在公网出口运行 api-enhanced 后重试'
                  : 'IM 连接失败: ' + message
              }
            },

}

window.LT.matchMethods = matchMethods
})()

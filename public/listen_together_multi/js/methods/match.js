;(function () {
  const {
    api,
    log,
    util,
    safeStorage,
    HEARTBEAT_INTERVAL,
    STATUS_INTERVAL,
    MATCH_POLL_INTERVAL,
    CHAT_INTERVAL,
    TICK_INTERVAL,
    REQ_TIMEOUT,
    CHAT_PAGE_SIZE,
    AUDIO_LEVELS,
    DEFAULT_AUDIO_LEVEL,
    LISTEN_STICKERS,
    loadSavedStickers,
  } = window.LT
  const matchMethods = {
    async startMatch() {
      if (this.isMatching) return
      const songId = this.selectedSongId
      if (!songId) {
        this.toast('请先选择一首匹配用歌', 'warn')
        this.openSongDialog('initial')
        return
      }
      const epoch = (this._matchEpoch = (this._matchEpoch || 0) + 1)
      this.isMatching = true
      this.matchStartedAt = Date.now()
      this.sync.sse = 'connecting'
      this.pane = 'stage'
      this.message = '正在连接匹配通知...'
      clearTimeout(this.matchTimeoutTimer)
      // SSE 一直不 connected 时也要能超时退出，不能永远停在「匹配中」
      this.matchTimeoutTimer = setTimeout(() => {
        if (epoch !== this._matchEpoch || !this.isMatching) return
        if (this._matchRequested) return
        this.cancelMatch()
        this.message = '匹配通知连接超时，请重试'
      }, 15000)
      this.closeMatchEvents()
      this._matchSongId = songId
      this._matchRequested = false
      const events = new EventSource(
        `/listentogether/multi/match/events?timestamp=${Date.now()}`,
      )
      this._matchEvents = events
      events.onmessage = (e) => {
        if (this._matchEvents !== events) return
        try {
          this.handleMatchEvent(JSON.parse(e.data))
        } catch (err) {}
      }
      events.onerror = () => {
        if (this._matchEvents !== events) return
        this.sync.sse = 'error'
        if (this.isMatching) this.message = '匹配通知连接中断，正在重连...'
      }
      events.onopen = () => {
        if (this._matchEvents !== events) return
        this.sync.sse = 'open'
        if (!this.isMatching) this._matchRequested = false
        this.message = '匹配通知已建立，等待 mini NIM 登录...'
      }
    },

    async requestMatch() {
      if (this._matchRequested) return
      const epoch = this._matchEpoch || 0
      clearTimeout(this.matchTimeoutTimer)
      this._matchRequested = true
      const songId = this._matchSongId || this.selectedSongId
      this.message = '匹配通知已登录，正在进入匹配池...'
      this._matchIgnoreFailedUntil = Date.now() + 2500
      try {
        try {
          await api({
            url: `/listentogether/multi/match/cancel`,
            method: 'post',
            data: { cookie: this.getFakeAndroidCookie() },
          })
        } catch (e) {}
        if (epoch !== this._matchEpoch) return
        const res = await api({
          url: `/listentogether/multi/match`,
          method: 'post',
          data: {
            songId,
            cookie: this.getFakeAndroidCookie(),
          },
        })
        // 用户已取消 / 已开始新一轮匹配，旧请求的响应直接丢弃
        if (epoch !== this._matchEpoch) return
        if (res.data.code === 200) {
          this.isMatching = true
          if (!this.matchStartedAt) this.matchStartedAt = Date.now()
          this.message = '匹配中，等待分配房间...'
          this.startPolling()
          this.matchTimeoutTimer = setTimeout(() => {
            if (epoch === this._matchEpoch && this.isMatching) {
              this.cancelMatch()
              this.message = '匹配超时，请重试'
            }
          }, 35000)
        } else {
          this.failMatch('匹配失败: ' + (res.data.message || '未知错误'))
        }
      } catch (error) {
        if (epoch !== this._matchEpoch) return
        this.failMatch(
          '匹配接口异常: ' + (error.response?.data?.message || error.message),
        )
      }
    },

    failMatch(message) {
      this.isMatching = false
      this.matchStartedAt = 0
      this._matchRequested = false
      clearTimeout(this.matchTimeoutTimer)
      this.closeMatchEvents()
      this.stopPolling()
      if (message) this.message = message
    },

    closeMatchEvents() {
      if (this.sync.sse === 'open') this.sync.sse = 'closed'
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
        this._matchRequested = false
        clearTimeout(this.matchTimeoutTimer)
        this.matchStartedAt = 0
        this.closeMatchEvents()
        this.message = '已找到房间，正在加入...'
        await this.acceptMatch(event.roomId)
        return
      }
      if (event.type === 'failed') {
        // /match/cancel can emit a MATCH_FAILED for the old pool while
        // we are resetting it; do not let that abort the new match.
        if (Date.now() < (this._matchIgnoreFailedUntil || 0)) return
        this.failMatch('官方匹配未成功: ' + (event.reason || 'MATCH_FAILED'))
        return
      }
      if (
        event.type === 'timeout' ||
        event.type === 'error' ||
        event.type === 'closed'
      ) {
        this.failMatch(
          event.type === 'error'
            ? '匹配通知失败: ' + (event.message || 'unknown')
            : '匹配通知已断开，请重试',
        )
      }
    },

    async acceptMatch(roomId) {
      const epoch = this._matchEpoch || 0
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
        if (epoch !== this._matchEpoch) return
        const snapshot = res.data.data?.multiLtRoomSnapshot
        if (res.data.code === 200 && snapshot) {
          this.roomInfo.roomId = snapshot.multiRoomInfoDTO.roomId
          this.roomInfo.creatorId = snapshot.multiRoomInfoDTO.creatorId
          this.roomInfo.chatRoomId = snapshot.multiRoomInfoDTO.chatRoomId || ''
          this.roomInfo.roomBizType = snapshot.multiRoomInfoDTO.roomBizType
          this.roomInfo.roomType = snapshot.multiRoomInfoDTO.roomType
          this.nextAddSongDuration =
            Number(res.data.data?.nextAddSongDuration) || 0
          this.message = '匹配成功，已进入房间'
          await this.fetchStatus()
          if (!this.isPolling) this.startPolling()
        } else {
          this.stopPolling()
          this.message = '加入房间失败: ' + (res.data.message || '未知错误')
        }
      } catch (error) {
        this.stopPolling()
        this.message =
          '加入房间异常: ' + (error.response?.data?.message || error.message)
      }
    },

    async cancelMatch() {
      // 让所有在途的 requestMatch / SSE 回调失效，避免取消后又被响应拉回匹配中
      this._matchEpoch = (this._matchEpoch || 0) + 1
      this._matchRequested = false
      this.isMatching = false
      this.matchStartedAt = 0
      this.message = '正在取消匹配...'
      this.closeMatchEvents()
      this.stopPolling()
      try {
        await api({
          url: `/listentogether/multi/match/cancel`,
          method: 'post',
          data: { cookie: this.getFakeAndroidCookie() },
        })
      } catch (error) {}
      this.isMatching = false
      this.matchStartedAt = 0
      clearTimeout(this.matchTimeoutTimer)
      this.stopPolling()
      this.message = '已取消匹配'
    },

    /* ---------------- IM 实时广播 ---------------- */

    handleImMessage(msg) {
      try {
        this._handleImMessage(msg)
      } catch (e) {
        log('IM', '广播解析失败', e?.message || e)
      }
    },

    _handleImMessage(msg) {
      if (!msg) return
      let payload = msg.custom ?? msg.remoteExtension ?? msg.localCustom ?? null
      if (typeof payload === 'string') {
        const fixed = util.fixMojibake(payload)
        try {
          payload = JSON.parse(fixed)
        } catch (e) {
          try {
            payload = JSON.parse(payload)
          } catch (err) {
            payload = null
          }
        }
      }
      const ext = payload && (payload.serverExt || payload.server || payload)
      const type = Number(ext && ext.type) || 0
      const content = ext && ext.content

      if (type === 30000) {
        this.applyImPlayState(content)
        return
      }
      if (type === 30008) {
        this.applyImOperate(content)
        return
      }
      if (type === 30005) {
        this.applyImMembers(content)
        return
      }
      // 聊天消息：优先增量插入；解析失败再退回一次历史拉取
      if (!type) {
        const appended = this.appendImChatMessage(msg, payload)
        if (!appended) this.scheduleImChat()
      }
    },

    appendImChatMessage(msg, payload) {
      try {
        const serverExt = (payload && payload.serverExt) || {}
        const clientExt = (payload && payload.clientExt) || {}
        const roomId = String(clientExt.roomId || serverExt.roomId || '')
        if (
          roomId &&
          this.roomInfo.roomId &&
          roomId !== String(this.roomInfo.roomId)
        ) {
          return true
        }

        const body = serverExt.imChatRoomMsgBody || {}
        const msgType = Number(serverExt.msgType ?? msg.msgType ?? 0)
        const isInteraction = msgType === 1
        const rawText =
          body.mainStateText ||
          body.text ||
          (typeof msg.text === 'string' ? msg.text : '') ||
          (typeof msg.content === 'string' ? msg.content : '')
        const text = util.fixMojibake(rawText).trim()
        const emoji =
          (payload && payload.emoji) ||
          serverExt.emoji ||
          clientExt.emoji ||
          null
        const resource =
          serverExt.resourceInfo || (payload && payload.resourceInfo) || null

        // 纯互动 / 空正文：要么是点赞顶歌这类广播，要么 body#3 只有空格，
        // 没有可展示内容时直接忽略，也不要因此拉一次历史。
        if (!text && !emoji && !resource) return true

        const sendUid = serverExt.userId || msg.from || ''
        const sendTime = Number(msg.time) || Number(msg.datetime) || Date.now()
        const record = {
          imChatRoomMsgBody: { text, mainStateText: text },
          // 互动消息（点赞/顶歌/切歌）按系统消息展示，不显示成发送者的聊天气泡
          sendUid: isInteraction ? null : sendUid || null,
          nickname: isInteraction ? '房间互动' : serverExt.nickname || '',
          avatarUrl: isInteraction ? '' : serverExt.avatarUrl || '',
          serverExt: {
            msgId: String(
              serverExt.msgId ||
                serverExt.serverSeq ||
                msg.id ||
                `${sendUid}:${sendTime}`,
            ),
            serverSeq: serverExt.serverSeq,
          },
          sendTime,
          msgType,
          emoji,
          resourceInfo: resource,
          source: 'im',
        }

        const mapped = this.mapChatRecord(record, 0)
        if (!mapped.text && !mapped.emojiUrl && !mapped.cover) return true
        if (!mapped.suggestSongId && resource && resource.resourceId) {
          const songId = Number(resource.resourceId)
          if (Number.isFinite(songId) && songId > 0)
            mapped.suggestSongId = songId
        }
        return this.appendChatMessage(mapped)
      } catch (e) {
        return false
      }
    },

    applyImPlayState(content) {
      if (!content || !content.playSong) return
      const ps = content.playSong
      const playInfo = {
        version: Number(content.version) || 0,
        playedTime: Number(content.playedTime) || 0,
        playSong: {
          songId: ps.songId,
          songBizId: ps.songBizId,
          songRcmdUid: ps.songRcmdUid,
          rcmdType: ps.rcmdType,
          alg: ps.alg,
        },
      }
      if (content.zanCnt !== undefined) {
        playInfo.playingSongZanCnt = Number(content.zanCnt) || 0
      }
      this.applyPlayInfo(playInfo)
      this.sync.lastIm = Date.now()
      this.imStatus = 'IM 实时同步（30000）'
      this.scheduleImStatus()
      if (
        content.waitSongCount !== undefined &&
        Number(content.waitSongCount) !== this.playingInfo.nextSongs.length
      ) {
        this.scheduleImQueue()
      }
    },

    applyImOperate(content) {
      if (!content) return
      const songId = Number(content.songId)
      if (songId && songId === Number(this.playingInfo.songId)) {
        if (content.zanCnt !== undefined) {
          this.playingInfo.zanCnt = Number(content.zanCnt) || 0
        }
        if (content.upCnt !== undefined) {
          this.playingInfo.upCnt = Number(content.upCnt) || 0
        }
        if (content.songBizId) this.playingInfo.bizId = content.songBizId
      }
      this.sync.lastIm = Date.now()
      this.imStatus = 'IM 实时同步（30008）'
      this.scheduleImStatus()
      this.scheduleImQueue()
    },

    applyImMembers(content) {
      if (!content) return
      const users = content.onlineUserInfos || content.users
      if (!Array.isArray(users)) return
      const total = Number(content.onlineNums) || 0
      if (total > 0) this.roomInfo.onlineNums = total
      if (!users.length) return

      // 服务端每次可能只给一个子集（甚至每次不同），这里按 uid 累积，
      // 只保留最近出现过的成员，人数上限对齐 onlineNums。
      const now = Date.now()
      const map = this._imMemberMap || (this._imMemberMap = new Map())
      for (const user of users) {
        const uid = util.uidOf(user)
        if (uid === '') continue
        map.set(String(uid), {
          user: {
            // 统一存归一化后的 uid；服务端有时期字段是 userId / id，
            // 直接存 user.uid 会变成 undefined，导致成员被整体丢掉
            uid: String(uid),
            nickname: util.fixMojibake(user.nickname || '听友'),
            avatar: user.avatar || user.avatarUrl || '',
          },
          seenAt: now,
        })
      }

      const ttl = 15 * 60 * 1000
      for (const [uid, entry] of map) {
        if (now - entry.seenAt > ttl) map.delete(uid)
      }
      let list = [...map.values()].sort((a, b) => b.seenAt - a.seenAt)
      const limit = total > 0 ? total : list.length
      if (list.length > limit) {
        list = list.slice(0, limit)
        this._imMemberMap = new Map(
          list.map((entry) => [String(entry.user.uid), entry]),
        )
      }

      const mapped = list.map((entry) => entry.user)
      // 昵称/头像变化也要触发重算，否则成员列表会一直显示旧信息
      const signature = mapped
        .map(
          (user) =>
            `${String(user.uid)}:${user.nickname || ''}:${user.avatar || ''}`,
        )
        .join(',')
      this._imMembers = mapped
      if (signature !== this._imMemberSignature) {
        this._imMemberSignature = signature
        this.recomputeRoomUsers()
      }
      const got = mapped.length
      this.imStatus = total
        ? `IM 实时成员 ${got}/${total}（30005 名单可能分批下发）`
        : `IM 实时成员 ${got} 人（30005）`
    },

    scheduleImStatus() {
      if (this._imStatusTimer) return
      this._imStatusTimer = setTimeout(() => {
        this._imStatusTimer = null
        if (!this.roomInfo.roomId) return
        this.fetchStatus().catch(() => {})
      }, 400)
    },

    scheduleImQueue() {
      if (this._imQueueTimer) return
      this._imQueueTimer = setTimeout(() => {
        this._imQueueTimer = null
        if (!this.roomInfo.roomId) return
        this.fetchFullQueue().catch(() => {})
      }, 700)
    },

    scheduleImChat() {
      if (this._imChatTimer) return
      this._imChatTimer = setTimeout(() => {
        this._imChatTimer = null
        if (!this.roomInfo.roomId) return
        this.fetchChat().catch(() => {})
      }, 260)
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
      if (this.imConnected || this._imChatroom)
        return this.disconnectImMembers()
      return this.connectImMembers()
    },

    disconnectImMembers() {
      // 换一代，旧连接的回调（onconnect/ondisconnect/onmsgs）全部失效，
      // 避免重新匹配时旧房间的回调把新连接顶掉。
      this._imGeneration = (this._imGeneration || 0) + 1
      const chatroom = this._imChatroom
      this._imChatroom = null
      this.imConnected = false
      this.imConnecting = false
      this.imStatus = '已断开'
      this._imMembers = []
      this._imMemberSignature = ''
      this._imMemberMap = new Map()
      if (this.recomputeRoomUsers) this.recomputeRoomUsers()
      try {
        if (chatroom) chatroom.disconnect()
      } catch (e) {}
    },

    autoConnectIm() {
      if (
        this.roomInfo.roomId &&
        this.roomInfo.chatRoomId &&
        !this._imChatroom &&
        !this.imConnecting
      )
        this.connectImMembers()
    },

    async connectImMembers() {
      if (this._imChatroom || this.imConnecting) return
      const chatRoomId = this.roomInfo.chatRoomId
      if (!chatRoomId) return (this.imStatus = '当前没有 ChatRoom ID')
      const generation = (this._imGeneration = (this._imGeneration || 0) + 1)
      this.imConnecting = true
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
        if (
          this._imGeneration !== generation ||
          this.roomInfo.chatRoomId !== chatRoomId ||
          !this.roomInfo.roomId
        ) {
          this.imConnecting = false
          return
        }
        this.imStatus = '连接聊天室…'
        const chatroom = window.Chatroom.getInstance({
          appKey: '3a6a3e48f6854dfa4e4464f3bdaec3b4',
          account: data.accId,
          token: data.token,
          chatroomId: chatRoomId,
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
            if (this._imGeneration !== generation) {
              try {
                chatroom.disconnect()
              } catch (e) {}
              return
            }
            this.imConnected = true
            this.imConnecting = false
            this.imStatus = 'IM 已连接，等待 30005'
            this.fetchChat().catch(() => {})
            this.fetchStatus().catch(() => {})
          },
          ondisconnect: (err) => {
            if (this._imGeneration !== generation) return
            this.imConnected = false
            this.imConnecting = false
            this._imChatroom = null
            this._imMembers = []
            this._imMemberMap = new Map()
            this._imMemberSignature = ''
            this.recomputeRoomUsers()
            this.imStatus = 'IM 断开: ' + ((err && err.message) || 'unknown')
          },
          onerror: (err) => {
            if (this._imGeneration !== generation) return
            this.imConnecting = false
            this.imStatus = 'IM 错误: ' + ((err && err.message) || 'unknown')
          },
          onmsgs: (msgs) => {
            if (this._imGeneration !== generation) return
            for (const msg of msgs || []) this.handleImMessage(msg)
          },
        })
        if (
          this._imGeneration !== generation ||
          this.roomInfo.chatRoomId !== chatRoomId ||
          !this.roomInfo.roomId
        ) {
          try {
            chatroom.disconnect()
          } catch (e) {}
          this.imConnecting = false
          return
        }
        this._imChatroom = chatroom
      } catch (e) {
        this.imConnected = false
        this.imConnecting = false
        this._imChatroom = null
        const message = e.message || String(e)
        this.imStatus = /clientip|414/.test(message)
          ? 'IM 连接失败：API 出口 IP 被云信判定为内网/代理（yunxinCode 414），请在公网出口运行 api-enhanced 后重试'
          : 'IM 连接失败: ' + message
      }
    },
  }

  window.LT.matchMethods = matchMethods
})()

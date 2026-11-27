;(function () {
  const {
    api,
    log,
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
  const roomMethods = {
    async login(silent = false) {
      if (this.mockMode) return true
      if (this._loginInflight) return this._loginInflight
      this._loginInflight = (async () => {
        try {
          const res = await api({ url: '/login/status', method: 'get' })
          const profile = res.data?.data?.profile
          if (!profile || res.data.data.code !== 200) {
            this.account.login = false
            if (!silent) this.toast('还没有登录，请扫码登录', 'warn')
            return false
          }
          this.account.userId = profile.userId
          this.account.nickname = profile.nickname
          this.account.avatar = profile.avatarUrl || this.account.avatar || ''
          this.account.login = true
          this.message = '登录成功'
          this.fetchLikedList().catch(() => {})
          await this.resumeIfInRoom()
          return true
        } catch (e) {
          if (!silent)
            this.toast('登录状态获取失败：' + (e.message || e), 'error')
          return false
        } finally {
          this._loginInflight = null
        }
      })()
      return this._loginInflight
    },

    async resumeIfInRoom() {
      try {
        const res = await api({
          url: `/listentogether/multi/match/status/get`,
          method: 'post',
          data: { cookie: this.getFakeAndroidCookie() },
        })
        const snapshot = res.data.data?.multiLtRoomSnapshot
        const dto = snapshot?.multiRoomInfoDTO
        if (dto && dto.roomId) {
          const members =
            snapshot?.multiLtRoomUserAgg?.onlineUserInfos?.length || 0
          this.resumeRoom = {
            roomId: dto.roomId,
            members,
            inviterUid: dto.firstUserId || dto.creatorId || 0,
          }
          this.message = '检测到进行中的房间，可在首页继续加入'
        }
      } catch (e) {}
    },

    async resumeRoomJoin() {
      if (!this.resumeRoom) return
      this.joinForm.roomId = String(this.resumeRoom.roomId)
      this.joinForm.inviterId = String(
        this.resumeRoom.inviterUid || this.account.userId || 0,
      )
      this.resumeRoom = null
      await this.joinRoom()
    },

    onShareInput() {
      if (this._shareTimer) clearTimeout(this._shareTimer)
      this._shareTimer = setTimeout(() => this.parseShareLink(), 350)
    },

    async parseShareLink() {
      const raw = this.shareLinkInput.trim()
      if (!raw || this.shareResolving) return
      this.shareResolving = true
      try {
        let fields = {}
        try {
          const match = raw.match(/https?:\/\/[^\s]+/i)
          const link = match ? match[0] : raw
          const url = new URL(
            /^https?:\/\//i.test(link) ? link : `https://${link}`,
          )
          const query = new URLSearchParams(url.search)
          fields = {
            roomId: query.get('roomId') || '',
            inviterUid: query.get('inviterUid') || query.get('inviterId') || '',
          }
        } catch (e) {}
        if (!fields.roomId) {
          const res = await api({
            url: '/share/resolve',
            method: 'post',
            data: { url: raw },
          })
          if (res.data.code !== 200)
            throw new Error(res.data.message || '分享链接解析失败')
          fields = res.data.data || {}
        }
        if (fields.roomId) this.joinForm.roomId = String(fields.roomId)
        if (fields.inviterUid)
          this.joinForm.inviterId = String(fields.inviterUid)
        if (this.joinForm.roomId) {
          this.message = this.joinForm.inviterId
            ? '已自动解析分享链接，请点击“确认加入”'
            : '已解析房间 ID，请补充邀请者 UID'
          this.joinOpen = true
        } else {
          this.message = '没有从链接中解析到房间信息'
        }
      } catch (e) {
        this.message =
          '链接解析失败: ' +
          (e.response?.data?.message || e.message || '未知错误')
      } finally {
        this.shareResolving = false
      }
    },

    async createRoom() {
      if (this.creatingRoom) return
      const songId = this.selectedSongId
      if (!songId) {
        this.toast('请先选择一首匹配用歌', 'warn')
        this.openSongDialog('initial')
        return
      }
      this.creatingRoom = true
      this.message = '创建房间中...'
      const roomType = this.allowStranger ? 2 : 1
      try {
        const res = await api({
          url: '/listentogether/multi/room/create',
          method: 'post',
          data: {
            type: roomType,
            songId,
            groupIds: '[]',
            inviteUids: '[]',
            cookie: this.getFakeAndroidCookie(),
          },
        })
        const snapshot = res.data.data?.multiLtRoomSnapshot
        if (res.data.code == 200 && snapshot) {
          this.roomInfo.roomId = snapshot.multiRoomInfoDTO.roomId
          this.roomInfo.creatorId = snapshot.multiRoomInfoDTO.creatorId
          this.roomInfo.chatRoomId = snapshot.multiRoomInfoDTO.chatRoomId || ''
          if (snapshot?.multiRoomInfoDTO?.roomBizType !== undefined)
            this.roomInfo.roomBizType = snapshot.multiRoomInfoDTO.roomBizType
          if (snapshot?.multiRoomInfoDTO?.roomType !== undefined)
            this.roomInfo.roomType = snapshot.multiRoomInfoDTO.roomType
          this.nextAddSongDuration =
            Number(res.data.data?.nextAddSongDuration) || 0
          const typeLabel = this.allowStranger
            ? '公房（允许陌生人 / 加歌冷却 60s）'
            : '私房（好友房 / 加歌无冷却）'
          this.message = typeLabel + ' 创建成功'
          this.startPolling()
        } else {
          this.message = '创建失败: ' + (res.data.message || '未知错误')
        }
      } catch (error) {
        this.message =
          '创建接口异常: ' + (error.response?.data?.message || error.message)
      } finally {
        this.creatingRoom = false
      }
    },

    async joinRoom() {
      if (this.joiningRoom) return
      const roomId = String(this.joinForm.roomId || '').trim()
      const inviterId = String(this.joinForm.inviterId || '').trim()
      if (!roomId || !inviterId)
        return (this.message = '请输入房间ID和邀请者UID')
      this.joiningRoom = true
      this.message = '加入房间中...'
      try {
        const res = await api({
          url: '/listentogether/multi/match/ack',
          method: 'post',
          data: {
            roomId,
            inviterUid: inviterId,
            agree: true,
            cookie: this.getFakeAndroidCookie(),
          },
        })
        if (res.data.code === 200 || res.data.status === 200) {
          const snapshot = res.data.data?.multiLtRoomSnapshot
          this.roomInfo.roomId = roomId
          this.roomInfo.inviterId = inviterId
          if (snapshot?.multiRoomInfoDTO?.chatRoomId) {
            this.roomInfo.chatRoomId = snapshot.multiRoomInfoDTO.chatRoomId
          }
          if (snapshot?.multiRoomInfoDTO?.roomBizType !== undefined)
            this.roomInfo.roomBizType = snapshot.multiRoomInfoDTO.roomBizType
          if (snapshot?.multiRoomInfoDTO?.roomType !== undefined)
            this.roomInfo.roomType = snapshot.multiRoomInfoDTO.roomType
          this.nextAddSongDuration =
            Number(res.data.data?.nextAddSongDuration) || 0
          this.message = '加入成功'
          this.startPolling()
        } else {
          this.message = '加入失败: ' + (res.data.message || '未知错误')
        }
      } catch (error) {
        this.message =
          '加入接口异常: ' + (error.response?.data?.message || error.message)
      } finally {
        this.joiningRoom = false
      }
    },

    async exitRoom() {
      try {
        await api({
          url: '/listentogether/multi/match/exit',
          method: 'post',
          data: {
            roomId: this.roomInfo.roomId,
            exitType: 'NORMAL_END',
            cookie: this.getFakeAndroidCookie(),
          },
        })
        this.resetLocalState()
        this.message = '已正常退出房间'
      } catch (error) {
        this.message = '退出接口异常，已本地重置'
        this.resetLocalState()
      }
    },

    async rematch() {
      if (this.isMatching || this.rematching) return
      this.rematching = true
      if (!this.roomInfo.roomId) {
        try {
          await this.startMatch()
        } finally {
          this.rematching = false
        }
        return
      }
      const last = this.lastSelectedSong
      const songId = Number(last?.id) || this.selectedSongId
      const songName = last?.name || this.selectedSong?.name || ''
      this.message = songName
        ? `正在退出当前房间，准备用《${songName}》重新匹配...`
        : '正在退出当前房间，准备重新匹配...'
      try {
        await api({
          url: '/listentogether/multi/match/exit',
          method: 'post',
          data: {
            roomId: this.roomInfo.roomId,
            exitType: 'CHANGE_ROOM',
            cookie: this.getFakeAndroidCookie(),
          },
        })
      } catch (e) {}
      this.resetLocalState()
      this.selectedSong = null
      if (songId) this.inputSongId = String(songId)
      this.message = '正在重新匹配...'
      try {
        await this.startMatch()
      } finally {
        this.rematching = false
      }
    },

    async forceExitAndReset() {
      this.message = '正在清理服务端残留状态...'
      let targetRoomId = this.roomInfo.roomId || this.joinForm.roomId
      if (!targetRoomId) {
        try {
          const statusRes = await api({
            url: `/listentogether/multi/match/status/get`,
            method: 'post',
            data: { cookie: this.getFakeAndroidCookie() },
          })
          const roomDTO =
            statusRes.data.data?.multiLtRoomSnapshot?.multiRoomInfoDTO
          if (roomDTO && roomDTO.roomId) targetRoomId = roomDTO.roomId
        } catch (e) {}
      }
      if (targetRoomId) {
        try {
          await api({
            url: '/listentogether/multi/match/exit',
            method: 'post',
            data: {
              roomId: targetRoomId,
              exitType: 'NORMAL_END',
              cookie: this.getFakeAndroidCookie(),
            },
          })
        } catch (e) {}
      }
      this.resetLocalState()
      this.message = '强制重置完成'
    },

    resetLocalState() {
      this.stopPolling()
      this.closeMatchEvents()
      this.disconnectImMembers()
      this.isMatching = false
      this.nextAddSongDuration = 0
      this.roomInfo = {
        roomId: null,
        creatorId: 0,
        chatRoomId: '',
        roomBizType: 0,
        roomType: '',
        roomUsers: [],
        onlineNums: 0,
        roomTags: [],
        hintText: '',
        nextRcmdText: '',
        specialOperate: false,
        permission: {
          addSong: true,
          switchSong: true,
          topSong: true,
          specialOperate: false,
        },
      }
      this._imMembers = []
      this._imMemberMap = new Map()
      this._httpMembers = []
      this._landingMembers = []
      this._landingMembersTried = false
      this._imMemberSignature = ''
      this.playingInfo = {
        songId: 0,
        bizId: 0,
        name: '',
        artist: '',
        cover: '',
        playedTime: 0,
        duration: 0,
        status: 'PLAY',
        zanCnt: 0,
        localLiked: 0,
        songRcmdUid: 0,
        rcmdType: 0,
        alg: '',
        version: 0,
        upCnt: 0,
        uped: false,
        nextSongs: [],
        audioSrc: '',
        actualLevel: '',
      }
      this.upCntMap = {}
      this.chatHistory = []
      this.chatUnread = 0
      this.chatUnreadAnchor = ''
      this.chatMore = false
      this.chatCursor = ''
      this.chatCursorLoaded = false
      this.chatAllPagesLoaded = false
      this.chatOpen = false
      this.chatInput = ''
      this.emojiPickerOpen = false
      this.mentionOpen = false
      this.pane = 'stage'
      this.immersive = false
      this.playedSongs = []
      this.playedCursor = ''
      this.playedMore = false
      this.playedLoaded = false
      this.queueTab = 'wait'
      this.lyricsOpen = false
      this.lyrics = {
        lines: [],
        title: '',
        loading: false,
        error: '',
        songId: 0,
      }
      this.lastHeartbeatTime = 0
      this.lastStatusTime = 0
      this.lastChatTime = 0
      this.emptyRoomCount = 0
      this.consecutiveFailures = 0
      this.chatAllPagesLoaded = false
      this.userNameCache = {}
      this.likedMap = {}
      this.lastQueueVersion = 0
      this.localPaused = false
      this.audioSwitching = false
      this.audioPlaying = false
      this.audioCurrentTime = 0
      this.audioDuration = 0
      clearTimeout(this.matchTimeoutTimer)
      const audio = document.getElementById('player')
      if (audio) {
        audio.onloadedmetadata = null
        audio.pause()
        audio.removeAttribute('src')
        audio.load()
      }
    },

    stopPolling() {
      this.isPolling = false
      this.pollGeneration++
      if (this.pollTimer) {
        clearTimeout(this.pollTimer)
        this.pollTimer = null
      }
    },

    startPolling() {
      this.stopPolling()
      const gen = ++this.pollGeneration
      this.isPolling = true
      this.lastHeartbeatTime = 0
      this.lastStatusTime = 0
      this.lastChatTime = 0
      this.emptyRoomCount = 0

      const poll = async () => {
        if (!this.isPolling || this.pollGeneration !== gen) return
        const now = Date.now()
        try {
          if (this.isMatching && !this.roomInfo.roomId) {
            if (now - this.lastStatusTime >= MATCH_POLL_INTERVAL) {
              this.lastStatusTime = now
              await this.fetchStatus()
            }
          } else if (this.roomInfo.roomId) {
            if (!this.chatAllPagesLoaded) {
              this.chatAllPagesLoaded = true
              this.fetchChatAllPages(3).catch(() => {})
            }
            if (now - this.lastHeartbeatTime >= HEARTBEAT_INTERVAL) {
              this.lastHeartbeatTime = now
              await this.heartbeat()
            }
            if (now - this.lastStatusTime >= STATUS_INTERVAL) {
              this.lastStatusTime = now
              await this.fetchStatus()
            }
            // IM 已连接时消息靠推送增量并入；继续轮询只会重复拉历史
            if (!this.imConnected && now - this.lastChatTime >= CHAT_INTERVAL) {
              this.lastChatTime = now
              await this.fetchChat()
            }
          }
        } catch (e) {
          log('Poll', '异常', e?.message)
        }
        if (this.isPolling && this.pollGeneration === gen) {
          this.pollTimer = setTimeout(poll, TICK_INTERVAL)
        }
      }
      poll()
    },

    async heartbeat() {
      const roomId = this.roomInfo.roomId
      if (!roomId) return
      const generation = this.pollGeneration
      try {
        const res = await api({
          url: `/listentogether/multi/match/heartbeat`,
          method: 'post',
          data: {
            roomId,
            cookie: this.getFakeAndroidCookie(),
          },
        })
        // 退出 / 重新匹配后，旧房间的心跳响应不能把播放状态写回来
        if (
          generation !== this.pollGeneration ||
          String(roomId) !== String(this.roomInfo.roomId)
        )
          return
        if (res.data.code === 200 && res.data.data) {
          const hb = res.data.data
          // 文档约定冷却剩余秒数在 data.nextAddSongDuration，不在顶层
          if (hb.nextAddSongDuration !== undefined) {
            this.nextAddSongDuration = Number(hb.nextAddSongDuration) || 0
          }
          this.consecutiveFailures = 0
          if (hb.roomPlaySongInfo) {
            this.applyPlayInfo(hb.roomPlaySongInfo)
            this.maybeSyncQueue(hb.roomPlaySongInfo)
          }
          if (hb.roomInfoDTO?.roomClosed) {
            this.resetLocalState()
            this.message = '房间已关闭'
          }
        } else {
          this.consecutiveFailures++
          this.checkFailures()
        }
      } catch (e) {
        this.consecutiveFailures++
        this.checkFailures()
      }
    },

    checkFailures() {
      if (this.consecutiveFailures >= 3) {
        this.stopPolling()
        this.message = '网络异常，已暂停轮询，请点「刷新房间状态」重试'
      }
    },

    async fetchStatus() {
      if (this.statusFetching) return false
      this.statusFetching = true
      const generation = this.pollGeneration
      let restartPolling = false
      try {
        const res = await api({
          url: `/listentogether/multi/match/status/get`,
          method: 'post',
          data: { cookie: this.getFakeAndroidCookie() },
        })
        // 退出 / 重新匹配 / 换房后，旧响应不能重新把房间「恢复」出来
        if (generation !== this.pollGeneration) return false
        if (res.data.code === 200 && res.data.data) {
          this.consecutiveFailures = 0
          await this.applyStatus(res.data.data)
          // 连续失败导致轮询停止后，任何一次成功查询都应恢复轮询
          restartPolling = !!this.roomInfo.roomId && !this.isPolling
          return true
        }
      } catch (e) {
        this.consecutiveFailures++
        this.checkFailures()
      } finally {
        this.statusFetching = false
        if (restartPolling) this.startPolling()
      }
      return false
    },

    async applyStatus(data) {
      const multiRoom = data.multiLtRoomSnapshot
      const permission = data.multiRoomPermission

      if (permission) {
        this.roomInfo.permission = Object.assign(
          {
            addSong: true,
            switchSong: true,
            topSong: true,
            specialOperate: false,
          },
          permission,
          {
            addSong: permission.addSong !== false,
            switchSong: permission.switchSong !== false,
            topSong: permission.topSong !== false,
            specialOperate: !!permission.specialOperate,
          },
        )
        this.roomInfo.specialOperate = !!permission.specialOperate
      }

      if (data.nextAddSongDuration !== undefined) {
        this.nextAddSongDuration = Number(data.nextAddSongDuration) || 0
      }

      if (
        this.isMatching &&
        !this.roomInfo.roomId &&
        multiRoom?.multiRoomInfoDTO?.roomId
      ) {
        // 状态轮询先看到了房间：作废还在途的 /match 响应与 SSE，避免又被改回匹配中
        this._matchEpoch = (this._matchEpoch || 0) + 1
        this._matchRequested = false
        this.isMatching = false
        clearTimeout(this.matchTimeoutTimer)
        this.closeMatchEvents()
        this.roomInfo.roomId = multiRoom.multiRoomInfoDTO.roomId
        this.roomInfo.creatorId = multiRoom.multiRoomInfoDTO.creatorId
        this.roomInfo.chatRoomId = multiRoom.multiRoomInfoDTO.chatRoomId || ''
        this.message = '匹配成功，已进入房间'
        try {
          await api({
            url: '/listentogether/multi/match/ack',
            method: 'post',
            data: {
              roomId: this.roomInfo.roomId,
              inviterUid: multiRoom.multiRoomInfoDTO.firstUserId || 0,
              agree: true,
              cookie: this.getFakeAndroidCookie(),
            },
          })
        } catch (e) {}
        this.lastStatusTime = 0
        return
      }

      if (!this.roomInfo.roomId && multiRoom?.multiRoomInfoDTO?.roomId) {
        this.roomInfo.roomId = multiRoom.multiRoomInfoDTO.roomId
        this.roomInfo.creatorId = multiRoom.multiRoomInfoDTO.creatorId
        this.roomInfo.chatRoomId = multiRoom.multiRoomInfoDTO.chatRoomId || ''
        this.message = '已恢复所在房间'
        if (!this.isPolling) this.startPolling()
      }

      if (!this.roomInfo.roomId) return

      if (!multiRoom) {
        this.emptyRoomCount++
        if (this.emptyRoomCount >= 3) {
          this.resetLocalState()
          this.message = '房间已结束或你已离开'
        }
        return
      }
      this.emptyRoomCount = 0

      const dto = multiRoom.multiRoomInfoDTO || {}
      if (dto.chatRoomId) this.roomInfo.chatRoomId = dto.chatRoomId
      if (dto.creatorId) this.roomInfo.creatorId = dto.creatorId
      if (dto.roomBizType !== undefined)
        this.roomInfo.roomBizType = dto.roomBizType
      if (dto.roomType !== undefined) this.roomInfo.roomType = dto.roomType

      if (Array.isArray(multiRoom.roomTagList)) {
        this.roomInfo.roomTags = multiRoom.roomTagList.slice()
      }

      const agg = multiRoom.multiLtRoomUserAgg || {}
      if (Array.isArray(agg.onlineUserInfos)) {
        this._httpMembers = agg.onlineUserInfos.map((user) => ({
          uid: window.LT.util.uidOf(user),
          nickname: user.nickname || '听友',
          avatar: user.avatar || user.avatarUrl || '',
        }))
        const total = Number(agg.onlineNums)
        if (!this.roomInfo.onlineNums && total > 0) {
          this.roomInfo.onlineNums = total
        }
        this.recomputeRoomUsers()
      }
      this.roomInfo.hintText = agg.text || ''
      let nextText = agg.nextText || ''
      if (nextText && agg.nextSongRcmd?.nickname) {
        nextText = nextText.replace('%s', agg.nextSongRcmd.nickname)
      }
      this.roomInfo.nextRcmdText = nextText

      if (multiRoom.roomPlaySongInfo) {
        this.applyPlayInfo(multiRoom.roomPlaySongInfo)
      }
    },

    applyPlayInfo(playInfo) {
      if (!playInfo || !playInfo.playSong) return
      const ps = playInfo.playSong

      if (ps.songRcmdUid && Number(ps.songRcmdUid) > 0) {
        if (!this.userNameCache[String(ps.songRcmdUid)]) {
          this.ensureUserNames([Number(ps.songRcmdUid)]).catch(() => {})
        }
      }

      const version = Number(playInfo.version || 0)
      const lastVersion = Number(this.playingInfo.version || 0)
      if (version && lastVersion && version < lastVersion) {
        log('PlayInfo', `忽略旧版本 ${version} < ${lastVersion}`)
        return
      }
      if (version) this.playingInfo.version = version

      const serverZan = Number(playInfo.playingSongZanCnt || 0)
      const playedSec = Math.floor((playInfo.playedTime || 0) / 1000)
      const isSameSong = Number(ps.songId) === Number(this.playingInfo.songId)
      const audio = document.getElementById('player')

      if (isSameSong) {
        this.playingInfo.zanCnt = Math.max(
          serverZan,
          this.playingInfo.zanCnt || 0,
        )
        this.playingInfo.playedTime = playedSec
        if (ps.songBizId) this.playingInfo.bizId = ps.songBizId
        this.playingInfo.songRcmdUid = Number(ps.songRcmdUid || 0)
        this.playingInfo.rcmdType = ps.rcmdType

        if (audio.src && Math.abs(audio.currentTime - playedSec) > 3) {
          try {
            audio.currentTime = playedSec
          } catch (e) {}
        }
        return
      }

      this.playingInfo.songId = Number(ps.songId)
      this.playingInfo.bizId = ps.songBizId
      this.playingInfo.songRcmdUid = Number(ps.songRcmdUid || 0)
      this.playingInfo.rcmdType = ps.rcmdType
      this.playingInfo.alg = ps.alg || ''
      this.playingInfo.zanCnt = serverZan
      this.playingInfo.localLiked = 0
      this.playingInfo.playedTime = playedSec
      this.playingInfo.name = ''
      this.playingInfo.artist = ''
      this.playingInfo.cover = ''
      this.playingInfo.duration = 0

      const upInfo = this.upCntMap[String(ps.songBizId)]
      if (upInfo) {
        this.playingInfo.upCnt = upInfo.upCnt
        this.playingInfo.uped = upInfo.uped
      } else {
        this.playingInfo.upCnt = 0
        this.playingInfo.uped = false
      }

      this.loadAudioForSong(ps.songId, playedSec).catch(() => {})
      this.fetchSongDetail(ps.songId)
    },

    maybeSyncQueue(playInfo) {
      if (!playInfo) return
      const version = Number(playInfo.version || 0)

      if (version && version !== this.lastQueueVersion) {
        this.lastQueueVersion = version

        log('Queue', '同步全量')
        setTimeout(() => {
          this.fetchFullQueue().catch(() => {})
        }, 1000)
        this.fetchChat().catch(() => {})
      }
    },

    async fetchFullQueue() {
      const roomId = this.roomInfo.roomId
      if (!roomId) return
      const generation = this.pollGeneration
      const baseUrl = this.roomInfo.specialOperate
        ? '/listentogether/multi/special/wait/song/list'
        : '/listentogether/multi/match/wait/song/list'

      let cursor = ''
      let allSongs = []
      let more = true
      const seen = new Set()

      while (more) {
        try {
          const pageObj = { size: 100 }
          if (cursor) pageObj.cursor = cursor

          const payload = {
            roomId,
            page: JSON.stringify(pageObj),
            cookie: this.getFakeAndroidCookie(),
          }

          const res = await api({
            url: baseUrl,
            method: 'post',
            data: payload,
          })

          if (
            generation !== this.pollGeneration ||
            String(roomId) !== String(this.roomInfo.roomId)
          )
            return
          if (res.data.code !== 200) {
            log('Queue', '拉取全量队列失败', res.data)
            break
          }

          const d = res.data.data || {}
          const list = d.songLists || []

          for (const row of list) {
            const si = row.songInfo || {}

            if (
              String(si.bizId) === String(this.playingInfo.bizId) ||
              row.playing === true
            ) {
              continue
            }

            if (
              row.rcmdUid &&
              row.nickname &&
              !this.userNameCache[String(row.rcmdUid)]
            ) {
              this.userNameCache[String(row.rcmdUid)] = row.nickname
            }

            if (row.liked !== undefined) {
              if (row.liked) this.likedMap[String(si.resourceId)] = true
              else delete this.likedMap[String(si.resourceId)]
            }

            if (si.upCnt !== undefined) {
              const bizId = String(si.bizId)
              const prev = this.upCntMap[bizId] || {
                upCnt: 0,
                uped: false,
              }
              this.upCntMap[bizId] = {
                upCnt: Math.max(prev.upCnt, Number(si.upCnt || 0)),
                uped: prev.uped || !!si.uped || !!row.uped,
              }
            }

            const src = this.songSource({ songRcmdUid: row.rcmdUid })
            allSongs.push({
              songId: si.resourceId,
              bizId: si.bizId,
              name: si.title || '未知歌曲',
              artist: Array.isArray(si.artistName)
                ? si.artistName.join('/')
                : si.artistName || '',
              cover: si.coverUrl || '',
              songRcmdUid: Number(row.rcmdUid || 0),
              rcmdType: row.rcmdType,
              isMine: src.isMine,
              sourceLabel: src.label,
              sourceType: src.type,
            })
          }

          if (!d.page?.more) {
            more = false
            break
          }
          cursor = d.page?.cursor || ''
          if (!cursor || seen.has(cursor)) break
          seen.add(cursor)
        } catch (e) {
          log(
            'Queue',
            'fetchFullQueue 请求异常',
            e?.response?.data || e?.message,
          )
          break
        }
      }

      if (
        generation !== this.pollGeneration ||
        String(roomId) !== String(this.roomInfo.roomId)
      )
        return
      this.playingInfo.nextSongs = allSongs
    },

    async ensureUserNames(uids) {
      const need = [
        ...new Set(
          uids
            .map((x) => String(x || 0))
            .filter((uid) => uid && uid !== '0' && !this.userNameCache[uid]),
        ),
      ]
      if (!need.length) return

      for (const u of this.roomInfo.roomUsers) {
        const uid = this.userUid(u)
        if (uid && !this.userNameCache[String(uid)]) {
          this.userNameCache[String(uid)] = u.nickname
        }
      }
      const stillNeed = need.filter((uid) => !this.userNameCache[uid])
      if (!stillNeed.length) return

      try {
        const res = await api({
          url: `/user/detail?uids=${stillNeed.join(',')}`,
          method: 'get',
          timeout: REQ_TIMEOUT,
          cacheable: true,
        })
        if (res.data.code === 200) {
          const list =
            res.data.profiles ||
            res.data.userProfiles ||
            (Array.isArray(res.data.data) ? res.data.data : [])
          for (const p of list) {
            if (p && p.userId && p.nickname) {
              this.userNameCache[String(p.userId)] = p.nickname
            }
          }
        }
      } catch (e) {
        log('User', 'ensureUserNames 异常', e?.message || e)
      }
    },

    async fetchSongDetail(songId) {
      try {
        const res = await api({
          url: `/song/detail?ids=${songId}`,
          method: 'get',
          cacheable: true,
        })
        if (Number(this.playingInfo.songId) !== Number(songId)) return
        if (res.data.code == 200 && res.data.songs?.length > 0) {
          const song = res.data.songs[0]
          this.playingInfo.name = song.name
          this.playingInfo.artist = song.ar.map((a) => a.name).join('/')
          this.playingInfo.cover = song.al.picUrl
          this.playingInfo.duration = Math.floor(song.dt / 1000)
        }
      } catch (e) {}
    },

    updateUpCntFromRecords(records) {
      if (!Array.isArray(records)) return
      for (const item of records) {
        const sid = item.sendUid
        const nick = item.nickname
        if (sid && nick && !this.userNameCache[String(sid)]) {
          this.userNameCache[String(sid)] = nick
        }

        if (item.interactType === 2) {
          const ri = item.resourceInfo
          if (!ri || !ri.bizId) continue
          const bizId = String(ri.bizId)
          const upCnt = Number(ri.upCnt || 0)
          const uped = !!ri.uped
          const prev = this.upCntMap[bizId] || { upCnt: 0, uped: false }
          this.upCntMap[bizId] = {
            upCnt: Math.max(prev.upCnt, upCnt),
            uped: prev.uped || uped,
          }
        }
      }
      const curBizId = String(this.playingInfo.bizId || '')
      if (curBizId && this.upCntMap[curBizId]) {
        this.playingInfo.upCnt = this.upCntMap[curBizId].upCnt
        this.playingInfo.uped = this.upCntMap[curBizId].uped
      }
    },

    async fetchLikedList() {
      if (!this.account.userId) return
      try {
        const res = await axios({
          url: `/likelist?uid=${this.account.userId}`,
          method: 'get',
          timeout: REQ_TIMEOUT,
          withCredentials: true,
        })
        if (res.data.code === 200 && Array.isArray(res.data.ids)) {
          const m = {}
          for (const id of res.data.ids) m[String(id)] = true
          this.likedMap = m
          log('Like', `已喜欢列表载入 ${res.data.ids.length} 首`)
        }
      } catch (e) {
        log('Like', 'fetchLikedList 异常', e?.message || e)
      }
    },

    async setLike(songId, like) {
      const sid = Number(songId)
      if (!sid) return false
      try {
        const res = await axios({
          url: `/like/v1?id=${sid}&like=${like}`,
          method: 'get',
          timeout: REQ_TIMEOUT,
          withCredentials: true,
        })
        if (res.data.code === 200 || res.data.status === 200) {
          if (like) this.likedMap[String(sid)] = true
          else delete this.likedMap[String(sid)]
          return true
        }
        this.message = '喜欢操作失败: ' + (res.data.message || '未知错误')
        return false
      } catch (e) {
        this.message =
          '喜欢接口异常: ' + (e?.response?.data?.message || e?.message || e)
        return false
      }
    },

    async toggleLikeCurrentSong() {
      if (!this.playingInfo.songId) return (this.message = '当前无播放歌曲')
      const songId = Number(this.playingInfo.songId)
      const bizId = String(this.playingInfo.bizId || '')
      const isLiked = !!this.likedMap[String(songId)]

      const ok = await this.setLike(songId, !isLiked)
      if (!ok) return

      if (!isLiked) {
        this.message = '已喜欢该歌曲'
        if (bizId && bizId !== '0') {
          this.operateSong(5, songId, bizId).catch(() => {})
        }
      } else {
        this.message = '已取消喜欢'
      }
    },
  }

  window.LT.roomMethods = roomMethods
})()

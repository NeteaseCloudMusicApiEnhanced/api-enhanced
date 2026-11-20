(function () {
const { api, log, safeStorage, HEARTBEAT_INTERVAL, STATUS_INTERVAL, MATCH_POLL_INTERVAL, CHAT_INTERVAL, TICK_INTERVAL, REQ_TIMEOUT, CHAT_PAGE_SIZE, AUDIO_LEVELS, DEFAULT_AUDIO_LEVEL, LISTEN_STICKERS, loadSavedStickers } = window.LT
const roomMethods = {
  async login(silent = false) {
              try {
                const res = await api({
                  url: `/login/status`,
                  method: 'get',
                })
                if (!res.data?.data || res.data.data.code != 200) {
                  if (!silent) alert('请先在 /qrlogin.html 扫码登录')
                  else this.message = '未登录，请点击上方链接登录'
                  return
                }
                this.account.userId = res.data.data.profile.userId
                this.account.nickname = res.data.data.profile.nickname
                this.account.login = true
                this.message = '登录成功'
                this.fetchLikedList().catch(() => {})
                await this.resumeIfInRoom()
              } catch (e) {
                if (!silent) alert('登录状态获取失败: ' + e.message)
              }
            },

  async resumeIfInRoom() {
              try {
                const res = await api({
                  url: `/listentogether/multi/match/status/get`,
                  method: 'post',
                  data: { cookie: this.getFakeAndroidCookie() },
                })
                const dto = res.data.data?.multiLtRoomSnapshot?.multiRoomInfoDTO
                if (dto && dto.roomId) {
                  this.roomInfo.roomId = dto.roomId
                  this.roomInfo.creatorId = dto.creatorId
                  this.roomInfo.chatRoomId = dto.chatRoomId || ''
                  if (res.data.nextAddSongDuration !== undefined) {
                    this.nextAddSongDuration =
                      Number(res.data.nextAddSongDuration) || 0
                  }
                  this.message = '已恢复所在房间'
                  await this.fetchStatus()
                  if (!this.isPolling) this.startPolling()
                }
              } catch (e) {}
            },

  parseShareLink() {
              const urlStr = this.shareLinkInput.trim()
              if (!urlStr) return
              try {
                const urlParams = new URLSearchParams(new URL(urlStr).search)
                if (urlParams.get('roomId'))
                  this.joinForm.roomId = urlParams.get('roomId')
                if (urlParams.get('inviterUid'))
                  this.joinForm.inviterId = Number(urlParams.get('inviterUid'))
                if (this.joinForm.roomId && this.joinForm.inviterId) {
                  this.message = '已自动解析分享链接，请点击“确认加入”'
                  const detailsEl = document.getElementById('joinDetails')
                  if (detailsEl) detailsEl.open = true
                }
              } catch (e) {}
            },

  async createRoom() {
              this.message = '创建房间中...'
              const songId = this.selectedSongId || 1372188635
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
                  this.roomInfo.chatRoomId =
                    snapshot.multiRoomInfoDTO.chatRoomId || ''
                  if (snapshot?.multiRoomInfoDTO?.roomBizType !== undefined)
                    this.roomInfo.roomBizType =
                      snapshot.multiRoomInfoDTO.roomBizType
                  if (snapshot?.multiRoomInfoDTO?.roomType !== undefined)
                    this.roomInfo.roomType =
                      snapshot.multiRoomInfoDTO.roomType
                  this.nextAddSongDuration =
                    Number(res.data.nextAddSongDuration) || 0
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
                  '创建接口异常: ' +
                  (error.response?.data?.message || error.message)
              }
            },

  async joinRoom() {
              const roomId = String(this.joinForm.roomId || '').trim()
              const inviterId = String(this.joinForm.inviterId || '').trim()
              if (!roomId || !inviterId)
                return (this.message = '请输入房间ID和邀请者UID')
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
                    this.roomInfo.chatRoomId =
                      snapshot.multiRoomInfoDTO.chatRoomId
                  }
                  if (snapshot?.multiRoomInfoDTO?.roomBizType !== undefined)
                    this.roomInfo.roomBizType =
                      snapshot.multiRoomInfoDTO.roomBizType
                  if (snapshot?.multiRoomInfoDTO?.roomType !== undefined)
                    this.roomInfo.roomType =
                      snapshot.multiRoomInfoDTO.roomType
                  this.nextAddSongDuration =
                    Number(res.data.nextAddSongDuration) || 0
                  this.message = '加入成功'
                  this.startPolling()
                } else {
                  this.message = '加入失败: ' + (res.data.message || '未知错误')
                }
              } catch (error) {
                this.message =
                  '加入接口异常: ' +
                  (error.response?.data?.message || error.message)
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
              this.isMatching = false
              this.nextAddSongDuration = 0
              this.roomInfo = {
                roomId: null,
                creatorId: 0,
                chatRoomId: '',
                roomBizType: 0,
                roomType: '',
                roomUsers: [],
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
              this.lastHeartbeatTime = 0
              this.lastStatusTime = 0
              this.lastChatTime = 0
              this.emptyRoomCount = 0
              this.consecutiveFailures = 0
              this.chatAllPagesLoaded = false
              this.userNameCache = {}
              this.likedMap = {}
              this.lastQueueVersion = 0
              clearTimeout(this.matchTimeoutTimer)
              const audio = document.getElementById('player')
              if (audio) {
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
                    if (now - this.lastChatTime >= CHAT_INTERVAL) {
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
              if (!this.roomInfo.roomId) return
              try {
                const res = await api({
                  url: `/listentogether/multi/match/heartbeat`,
                  method: 'post',
                  data: {
                    roomId: this.roomInfo.roomId,
                    cookie: this.getFakeAndroidCookie(),
                  },
                })
                if (res.data.code === 200 && res.data.data) {
                  if (res.data.nextAddSongDuration !== undefined) {
                    this.nextAddSongDuration =
                      Number(res.data.nextAddSongDuration) || 0
                  }
                  this.consecutiveFailures = 0
                  const hb = res.data.data
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
                this.message = '网络异常，已暂停轮询，请检查网络后刷新页面'
              }
            },

  async fetchStatus() {
              if (this.statusFetching) return false
              this.statusFetching = true
              try {
                const res = await api({
                  url: `/listentogether/multi/match/status/get`,
                  method: 'post',
                  data: { cookie: this.getFakeAndroidCookie() },
                })
                if (res.data.code === 200 && res.data.data) {
                  this.consecutiveFailures = 0
                  await this.applyStatus(res.data.data)
                  return true
                }
              } catch (e) {
                this.consecutiveFailures++
                this.checkFailures()
              } finally {
                this.statusFetching = false
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

              if (
                this.isMatching &&
                !this.roomInfo.roomId &&
                multiRoom?.multiRoomInfoDTO?.roomId
              ) {
                this.isMatching = false
                clearTimeout(this.matchTimeoutTimer)
                this.roomInfo.roomId = multiRoom.multiRoomInfoDTO.roomId
                this.roomInfo.creatorId = multiRoom.multiRoomInfoDTO.creatorId
                this.roomInfo.chatRoomId =
                  multiRoom.multiRoomInfoDTO.chatRoomId || ''
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
                this.roomInfo.chatRoomId =
                  multiRoom.multiRoomInfoDTO.chatRoomId || ''
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
              if (dto.roomType !== undefined)
                this.roomInfo.roomType = dto.roomType

              if (Array.isArray(multiRoom.roomTagList)) {
                this.roomInfo.roomTags = multiRoom.roomTagList.slice()
              }

              const agg = multiRoom.multiLtRoomUserAgg || {}
              if (Array.isArray(agg.onlineUserInfos)) {
                this.roomInfo.roomUsers = agg.onlineUserInfos.slice()
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
              const isSameSong =
                Number(ps.songId) === Number(this.playingInfo.songId)
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
              if (!this.roomInfo.roomId) return
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
                    roomId: this.roomInfo.roomId,
                    page: JSON.stringify(pageObj),
                    cookie: this.getFakeAndroidCookie(),
                  }

                  const res = await api({
                    url: baseUrl,
                    method: 'post',
                    data: payload,
                  })

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

              this.playingInfo.nextSongs = allSongs
            },

  async ensureUserNames(uids) {
              const need = [
                ...new Set(
                  uids
                    .map((x) => String(x || 0))
                    .filter(
                      (uid) => uid && uid !== '0' && !this.userNameCache[uid],
                    ),
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

  async fetchChatAllPages(maxPages = 3) {
              if (!this.roomInfo.roomId) return
              const baseUrl = this.roomInfo.specialOperate
                ? '/listentogether/multi/special/msg/history'
                : '/listentogether/multi/match/msg/history'
              let cursor = ''
              let pages = 0
              let lastSuccess = false

              while (pages < maxPages) {
                try {
                  const qs = new URLSearchParams({
                    size: String(CHAT_PAGE_SIZE),
                  })
                  if (cursor) qs.set('cursor', String(cursor))

                  const res = await api({
                    url: baseUrl + '?' + qs.toString(),
                    method: 'post',
                    data: {
                      roomId: this.roomInfo.roomId,
                      direction: 0,
                      cookie: this.getFakeAndroidCookie(),
                    },
                  })
                  if (res.data.code !== 200) break

                  const d = res.data.data || {}
                  const records = d.records || []
                  log(
                    'UpCnt',
                    `第 ${pages + 1} 页：size=${CHAT_PAGE_SIZE}, 实返=${records.length}, more=${d.page?.more}, cursor=${d.page?.cursor}`,
                  )

                  if (!records.length) break
                  this.updateUpCntFromRecords(records)
                  lastSuccess = true

                  if (!d.page?.more) break
                  cursor = d.page?.cursor || ''
                  if (!cursor) break
                  pages++
                } catch (e) {
                  break
                }
              }
            },

  async fetchChat() {
              if (!this.roomInfo.roomId) return
              const baseUrl = this.roomInfo.specialOperate
                ? '/listentogether/multi/special/msg/history'
                : '/listentogether/multi/match/msg/history'
              try {
                const qs = new URLSearchParams({
                  size: String(CHAT_PAGE_SIZE),
                })
                const res = await api({
                  url: baseUrl + '?' + qs.toString(),
                  method: 'post',
                  data: {
                    roomId: this.roomInfo.roomId,
                    direction: 0,
                    cookie: this.getFakeAndroidCookie(),
                  },
                })
                if (
                  res.data.code == 200 &&
                  Array.isArray(res.data.data?.records)
                ) {
                  const records = res.data.data.records
                  this.updateUpCntFromRecords(records)

                  const myUid = String(this.account.userId || '')
                  const list = records
                    .filter((item) => {
                      const only = item.onlyCanSeeUserIds
                      if (
                        Array.isArray(only) &&
                        only.length > 0 &&
                        !only.map(String).includes(myUid)
                      )
                        return false
                      return true
                    })
                    .map((item, index) => this.mapChatRecord(item, index))

                  const oldLen = this.chatHistory.length
                  const lastOldMsg =
                    oldLen > 0 ? this.chatHistory[oldLen - 1].id : ''
                  const lastNewMsg =
                    list.length > 0 ? list[list.length - 1].id : ''

                  this.chatHistory = list

                  if (lastOldMsg !== lastNewMsg) {
                    if (!this.chatOpen && oldLen > 0) {
                      const oldIndex = lastOldMsg
                        ? list.findIndex(
                            (msg) => String(msg.id) === String(lastOldMsg),
                          )
                        : -1
                      const incoming =
                        oldIndex >= 0
                          ? list.length - oldIndex - 1
                          : list.length
                      if (incoming > 0)
                        this.chatUnread = Math.min(
                          999,
                          this.chatUnread + incoming,
                        )
                    }
                    setTimeout(() => {
                      const el = document.getElementById('chatList')
                      if (el) el.scrollTop = el.scrollHeight
                    }, 100)
                  }
                }
              } catch (e) {
                log('Chat', '请求异常', e?.message || e)
              }
            },

  mapChatRecord(item, index) {
              const body = item.imChatRoomMsgBody || {}
              const rich = body.msgRichText
              let emoji = item.emoji || item.clientExt?.emoji || null
              if (typeof emoji === 'string') {
                try {
                  emoji = JSON.parse(emoji)
                } catch (e) {
                  emoji = null
                }
              }
              const serverExt = item.serverExt || {}
              const stableId = String(
                serverExt.msgId || item.sendTime || `idx-${index}`,
              )

              const sendUid = item.sendUid ?? serverExt.userId ?? null
              const nickname = item.nickname || serverExt.nickname || ''
              const avatarUrl = item.avatarUrl || serverExt.avatarUrl || ''
              const isSystem = !sendUid

              const isEmoji = item.msgType === 0 && emoji
              const emojiUrl = isEmoji
                ? emoji.emojiAnimUrl || emoji.emojiImgUrl
                : ''

              let suggestSongId = null
              if (rich?.contentTextList) {
                for (const c of rich.contentTextList) {
                  if (c.highLighted && c.orpheus) {
                    const m = c.orpheus.match(/addSong\?songId=(\d+)/)
                    if (m) {
                      suggestSongId = Number(m[1])
                      break
                    }
                  }
                }
              }

              const ri = item.resourceInfo
              return {
                id: stableId,
                sendUid,
                nickname: isSystem ? nickname || '系统' : nickname,
                avatarUrl,
                isSystem,
                emojiUrl,
                emoji: isEmoji ? emoji : null,
                text: body.mainStateText || body.text || '',
                cover: ri?.coverUrl || '',
                songName: ri?.title || '',
                artistName: Array.isArray(ri?.artistName)
                  ? ri.artistName.join('/')
                  : ri?.artistName || '',
                resourceInfo: ri || null,
                suggestSongId,
                sendTime: item.sendTime,
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
                  '喜欢接口异常: ' +
                  (e?.response?.data?.message || e?.message || e)
                return false
              }
            },

  async toggleLikeCurrentSong() {
              if (!this.playingInfo.songId)
                return (this.message = '当前无播放歌曲')
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

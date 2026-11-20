(function () {
const { api, log, safeStorage, HEARTBEAT_INTERVAL, STATUS_INTERVAL, MATCH_POLL_INTERVAL, CHAT_INTERVAL, TICK_INTERVAL, REQ_TIMEOUT, CHAT_PAGE_SIZE, AUDIO_LEVELS, DEFAULT_AUDIO_LEVEL, LISTEN_STICKERS, loadSavedStickers } = window.LT
const songsMethods = {
  openSongDialog(mode = 'add') {
    this.songDialogMode = mode === 'initial' ? 'initial' : 'add'
    this.songOpen = true
    this.songResults = []
    if (this.songDialogMode === 'add') {
      this.songInput = ''
      this.selectedSong = null
    } else if (this.selectedSong) {
      this.songInput = this.selectedSong.name
    }
  },

  closeSongDialog() {
    this.songOpen = false
    if (this._songTimer) clearTimeout(this._songTimer)
  },

  onSongInput() {
    if (this._songTimer) clearTimeout(this._songTimer)
    this.selectedSong = null
    this.inputSongId = ''
    this.songResults = []
    const value = this.songInput.trim()
    if (!value) return
    if (/^\d{1,24}$/.test(value)) this.inputSongId = value
    this._songTimer = setTimeout(() => this.resolveSongInput(), 450)
  },

  async resolveSongInput() {
    const raw = this.songInput.trim()
    if (!raw || this.songSearching) return
    this.songSearching = true
    this.songResults = []
    try {
      const reference = await this.resolveSongReference(raw)
      if (reference.songId) {
        await this.loadSongById(reference.songId)
        return
      }
      if (reference.roomId) this.message = '这是房间链接，不是歌曲链接，已按关键词搜索'
      this.songSearching = false
      await this.searchSongs(raw)
    } catch (e) {
      this.message =
        '歌曲解析失败: ' +
        (e.response?.data?.message || e.message || '未知错误')
    } finally {
      this.songSearching = false
    }
  },

  async resolveSongReference(raw) {
    const match = String(raw).match(/https?:\/\/[^\s]+/i)
    if (!match) return /^\d{1,24}$/.test(raw) ? { songId: raw } : {}
    const link = match[0]
    try {
      const url = new URL(link)
      const query = new URLSearchParams(url.search)
      const hash = url.hash.includes('?')
        ? new URLSearchParams(url.hash.slice(url.hash.indexOf('?') + 1))
        : new URLSearchParams()
      const id =
        query.get('id') ||
        query.get('songId') ||
        hash.get('id') ||
        hash.get('songId')
      if (/^\d{1,24}$/.test(id || '')) return { songId: id }
    } catch (e) {}
    try {
      const res = await api({
        url: '/share/resolve',
        method: 'post',
        data: { url: link },
      })
      if (res.data.code === 200) return res.data.data || {}
    } catch (e) {
      log('Song', '分享链接解析失败', e.message)
    }
    return {}
  },

  async loadSongById(id) {
    const res = await api({
      url: '/song/detail',
      method: 'get',
      params: { ids: String(id) },
    })
    const song = res.data?.songs?.[0]
    if (!song) throw new Error('未找到这首歌曲')
    const mapped = {
      id: String(song.id),
      name: song.name,
      artist: (song.ar || [])
        .map((artist) => artist.name)
        .filter(Boolean)
        .join(' / '),
      cover: song.al?.picUrl || '',
      duration: song.dt || 0,
    }
    this.selectedSong = mapped
    this.inputSongId = mapped.id
    this.songInput = mapped.name
    this.songResults = []
    this.message = `已解析歌曲: ${mapped.name}`
    return mapped
  },

  async searchSongs(keywords) {
    const query = String(keywords ?? this.songInput).trim()
    if (!query) return (this.message = '请输入歌曲名或歌手')
    if (this.songSearching) return
    this.songSearching = true
    this.songResults = []
    try {
      const res = await api({
        url: '/cloudsearch',
        method: 'get',
        params: { keywords: query, type: 1, limit: 8 },
      })
      const raw = res.data?.result?.songs || []
      this.songResults = raw.map((song) => ({
        id: String(song.id),
        name: song.name,
        artist: (song.ar || [])
          .map((artist) => artist.name)
          .filter(Boolean)
          .join(' / '),
        cover: song.al?.picUrl || '',
        duration: song.dt || 0,
      }))
      this.message = this.songResults.length
        ? `找到 ${this.songResults.length} 首歌曲`
        : '没有找到匹配的歌曲'
    } catch (e) {
      this.message =
        '搜索失败: ' +
        (e.response?.data?.message || e.message || '未知错误')
    } finally {
      this.songSearching = false
    }
  },

  selectSong(song) {
    if (!song?.id) return
    this.selectedSong = song
    this.inputSongId = String(song.id)
    this.songInput = song.name
    this.songResults = []
    this.message = `已选择: ${song.name}`
  },

  async addSelectedSong() {
    const songId = this.selectedSongId
    if (!songId) return (this.message = '请先搜索或解析歌曲')
    if (!this.roomInfo.permission.addSong)
      return (this.message = '当前没有加歌权限')
    if (this.nextAddSongDuration > 0)
      return (this.message = `加歌冷却中，剩 ${this.nextAddSongDuration}s`)
    const ok = await this.operateSong(1, songId)
    if (ok) {
      this.closeSongDialog()
      this.selectedSong = null
      this.songInput = ''
      this.songResults = []
    }
  },

  async sendChat() {
              if (this.chatSending) return
              const text = this.chatInput.trim()
              if (!text || !this.roomInfo.chatRoomId) return
              this.chatSending = true
              try {
                const res = await api({
                  url: `/listentogether/multi/chat/send`,
                  method: 'post',
                  data: {
                    roomId: this.roomInfo.roomId,
                    chatRoomId: this.roomInfo.chatRoomId,
                    text,
                    cookie: this.getFakeAndroidCookie(),
                  },
                })
                if (res.data.code === 200) {
                  if (this.chatInput === text) this.chatInput = ''
                  await this.fetchChat()
                } else {
                  this.message = '发送失败: ' + (res.data.message || '未知错误')
                }
              } catch (e) {
                this.message =
                  '发送异常: ' +
                  (e.response?.data?.message || e.message || '未知错误')
              } finally {
                this.chatSending = false
              }
            },

  async nextSong() {
              if (!this.roomInfo.permission.switchSong)
                return (this.message = '无切歌权限')
              if (!this.playingInfo.songId)
                return (this.message = '当前无播放歌曲')
              if (
                !this.playingInfo.bizId ||
                String(this.playingInfo.bizId) === '0'
              ) {
                await this.fetchStatus()
              }
              if (
                !this.playingInfo.bizId ||
                String(this.playingInfo.bizId) === '0'
              ) {
                return (this.message = '缺少当前歌曲 bizId，无法切歌，请稍后重试')
              }
              const beforeSongId = Number(this.playingInfo.songId)
              const ok = await this.operateSong(
                4,
                this.playingInfo.songId,
                this.playingInfo.bizId,
              )
              if (ok) {
                this.message = '切歌指令已发送，等待服务端切换…'
                setTimeout(async () => {
                  await this.fetchStatus()
                  if (Number(this.playingInfo.songId) === beforeSongId) {
                    this.message =
                      '已发送切歌，等待投票或服务端切换（可再点一次加强）'
                  }
                }, 1500)
              }
            },

  async likeCurrentSong() {
              if (!this.playingInfo.songId)
                return (this.message = '当前无播放歌曲')
              if (
                !this.playingInfo.bizId ||
                String(this.playingInfo.bizId) === '0'
              ) {
                await this.fetchStatus()
              }
              if (
                !this.playingInfo.bizId ||
                String(this.playingInfo.bizId) === '0'
              ) {
                return (this.message = '缺少当前歌曲 bizId，无法点赞')
              }
              const targetSongId = Number(this.playingInfo.songId)
              const targetBizId = this.playingInfo.bizId
              const ok = await this.operateSong(3, targetSongId, targetBizId)
              if (ok) {
                if (Number(this.playingInfo.songId) === targetSongId) {
                  this.playingInfo.zanCnt = this.playingInfo.zanCnt || 0
                  this.message = `已点赞当前歌曲`
                } else {
                  this.message = '点赞成功（歌曲已切换）'
                }
              }
            },

  async operateSong(
              operateType,
              targetSongId = null,
              targetBizId = null,
            ) {
              if (!this.roomInfo.roomId) return false
              let songId,
                bizId = '0'

              if (operateType === 1) {
                songId = targetSongId || Number(this.inputSongId)
                bizId = '0'
              } else if (operateType === 4) {
                songId = targetSongId || this.playingInfo.songId
                bizId = String(targetBizId || this.playingInfo.bizId || '0')
              } else {
                songId = targetSongId || Number(this.inputSongId)
                if (
                  targetBizId !== null &&
                  targetBizId !== undefined &&
                  String(targetBizId) !== '0'
                ) {
                  bizId = String(targetBizId)
                } else {
                  const found = this.playingInfo.nextSongs.find(
                    (s) => s.songId === songId,
                  )
                  if (found) bizId = String(found.bizId)
                  else if (songId === this.playingInfo.songId)
                    bizId = String(this.playingInfo.bizId || '0')
                }
              }

              if (!songId) {
                this.message = '请输入或选择歌曲'
                return false
              }

              if (operateType === 2 && bizId !== '0') {
                const idx = this.playingInfo.nextSongs.findIndex(
                  (s) => String(s.bizId) === bizId,
                )
                if (idx > 0) {
                  const [song] = this.playingInfo.nextSongs.splice(idx, 1)
                  this.playingInfo.nextSongs.unshift(song)
                }
              } else if (operateType === 7 && bizId !== '0') {
                this.playingInfo.nextSongs = this.playingInfo.nextSongs.filter(
                  (s) => String(s.bizId) !== bizId,
                )
              }

              const url = this.roomInfo.specialOperate
                ? '/listentogether/multi/special/song/operate'
                : '/listentogether/multi/match/song/operate'

              try {
                const res = await api({
                  url,
                  method: 'post',
                  data: {
                    roomId: this.roomInfo.roomId,
                    songId,
                    bizId,
                    operate: operateType,
                    cookie: this.getFakeAndroidCookie(),
                  },
                })

                if (res.data.code == 200 && res.data.data?.result === false) {
                  this.message = '操作失败: ' + (res.data.data.failedMsg || '')
                  return false
                }

                if (res.data.code == 200) {
                  const d = res.data.data || {}

                  if (d.roomSongInfo) {
                    this.applyPlayInfo(d.roomSongInfo)
                  }

                  const msg = d.failedMsg
                  if (operateType === 1) this.inputSongId = ''
                  if (operateType !== 3) {
                    this.message = msg || '操作成功'
                  }

                  if (
                    operateType === 1 ||
                    operateType === 2 ||
                    operateType === 7
                  ) {
                    this.fetchChat().catch(() => {})
                  }

                  if (this.roomInfo.roomId) {
                    this.lastHeartbeatTime = Date.now()
                    this.heartbeat().catch(() => {})
                  }

                  return true
                }
                this.message = '操作失败: ' + (res.data.message || '')
                return false
              } catch (error) {
                this.message =
                  '操作接口异常: ' +
                  (error.response?.data?.message || error.message)
                this.fetchFullQueue().catch(() => {})
                return false
              }
            },

  togglePlay() {
              const audio = document.getElementById('player')
              if (!audio.src) return (this.message = '当前无播放音频')
              if (audio.paused) {
                audio
                  .play()
                  .then(() => {
                    this.playingInfo.status = 'PLAY'
                  })
                  .catch(() => {
                    this.message = '播放被浏览器拦截，请再点一次'
                  })
              } else {
                audio.pause()
                this.playingInfo.status = 'PAUSE'
              }
            },

  async fetchSongUrl(songId, level) {
              try {
                const res = await axios({
                  url: `/song/url/v1?id=${songId}&level=${level}`,
                  method: 'get',
                  timeout: REQ_TIMEOUT,
                  withCredentials: true,
                })
                if (
                  res.data.code === 200 &&
                  Array.isArray(res.data.data) &&
                  res.data.data.length > 0
                ) {
                  const d = res.data.data[0]
                  return {
                    url: d.url || '',
                    level: d.level || level,
                    freeTrialInfo: d.freeTrialInfo || null,
                  }
                }
              } catch (e) {
                log('Audio', 'fetchSongUrl 异常', e?.message || e)
              }
              return { url: '', level: '', freeTrialInfo: null }
            },

  async resolveAudioUrl(songId, preferredLevel) {
              let r = await this.fetchSongUrl(songId, preferredLevel)
              if (r.url) return r

              if (preferredLevel !== 'standard') {
                r = await this.fetchSongUrl(songId, 'standard')
                if (r.url) return r
              }

              return {
                url:
                  'https://music.163.com/song/media/outer/url?id=' +
                  songId +
                  '.mp3',
                level: 'standard',
                freeTrialInfo: null,
                fallback: true,
              }
            },

  async loadAudioForSong(songId, seekTo) {
              const sid = Number(songId)
              const audio = document.getElementById('player')
              const r = await this.resolveAudioUrl(sid, this.audioLevel)

              if (Number(this.playingInfo.songId) !== sid) return
              if (!r || !r.url) return

              if (this.playingInfo.audioSrc === r.url) {
                if (audio.src && Math.abs(audio.currentTime - seekTo) > 3) {
                  try {
                    audio.currentTime = seekTo
                  } catch (e) {}
                }
                return
              }

              this.playingInfo.audioSrc = r.url
              this.playingInfo.actualLevel = r.level
              if (r.fallback)
                log('Audio', `歌曲 ${sid} 高音质不可用，已用 128k 兜底`)
              if (r.freeTrialInfo)
                log('Audio', `歌曲 ${sid} 为试听片段`, r.freeTrialInfo)

              audio.pause()
              audio.onloadedmetadata = () => {
                try {
                  audio.currentTime = Math.max(0, seekTo)
                } catch (e) {}
                audio
                  .play()
                  .then(() => {
                    if (
                      this.message.includes('拦截') ||
                      this.message.includes('点击')
                    ) {
                      this.message = '播放中'
                    }
                  })
                  .catch(() => {
                    this.message = '浏览器限制了自动播放，请点击页面任意位置开始'
                  })
                audio.onloadedmetadata = null
              }
              audio.src = r.url
              audio.load()
            },

  async onLevelChange() {
              safeStorage.set('audio_level', this.audioLevel)
              this.message = '音质已切换为: ' + this.levelLabel(this.audioLevel)

              const sid = Number(this.playingInfo.songId)
              if (!sid) return

              const audio = document.getElementById('player')
              const wasPlaying = !audio.paused
              const t = audio.currentTime || 0

              const r = await this.resolveAudioUrl(sid, this.audioLevel)
              if (Number(this.playingInfo.songId) !== sid) return
              if (!r || !r.url) {
                this.message = '当前音质不可用'
                return
              }
              if (this.playingInfo.audioSrc === r.url) {
                this.message = '当前已是该音质'
                return
              }

              this.playingInfo.audioSrc = r.url
              this.playingInfo.actualLevel = r.level
              if (r.fallback)
                this.message = '所选音质不可用，已自动降级到标准 128k'

              audio.pause()
              audio.onloadedmetadata = () => {
                try {
                  audio.currentTime = Math.max(0, t)
                } catch (e) {}
                if (wasPlaying) audio.play().catch(() => {})
                audio.onloadedmetadata = null
              }
              audio.src = r.url
              audio.load()
            },

}

window.LT.songsMethods = songsMethods
})()

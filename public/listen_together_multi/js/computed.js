;(function () {
  'use strict'

  const { LISTEN_STICKERS, util } = window.LT

  const computed = {
    /* ---------------- 视图 ---------------- */
    view() {
      if (!this.account.login) return 'login'
      return this.roomInfo.roomId ? 'room' : 'lobby'
    },

    resolvedTheme() {
      if (this.theme === 'dark' || this.theme === 'light') return this.theme
      return this.systemDark ? 'dark' : 'light'
    },

    /* ---------------- 房间 ---------------- */
    shareUrl() {
      if (!this.roomInfo.roomId) return ''
      const inviterUid = this.account.userId || this.roomInfo.creatorId || 0
      return `https://st.music.163.com/listen-together/multishare/index.html?roomId=${encodeURIComponent(this.roomInfo.roomId)}&inviterUid=${encodeURIComponent(inviterUid)}`
    },

    roomStatusText() {
      if (this.isMatching) return '匹配中'
      return this.roomInfo.roomId ? '房间中' : '未加入'
    },

    memberCount() {
      return Math.max(
        Number(this.roomInfo.onlineNums) || 0,
        this.roomInfo.roomUsers.length,
      )
    },

    syncState() {
      if (this.roomInfo.roomId) {
        if (this.consecutiveFailures >= 2) return 'offline'
        if (this.isPolling) return 'live'
        return 'busy'
      }
      return this.isMatching ? 'busy' : 'idle'
    },

    syncLabel() {
      if (!this.roomInfo.roomId) {
        return this.isMatching ? '匹配中…' : '未进入房间'
      }
      if (this.consecutiveFailures >= 2) return '重连中…'
      if (this.isPolling) return '已同步'
      return '已暂停'
    },

    /**
     * 房间类型判定：
     *  1) specialOperate === true          → 特殊房
     *  2) roomType === MULTI_MATCH_SONG    → 公开匹配房
     *  3) roomType === FOLLOW_LISTEN       → 关注一起听
     *  4) roomBizType 1/2                  → 私密/公开好友房
     */
    roomTypeInfo() {
      if (this.roomInfo.specialOperate) {
        return { key: 'special', label: '特殊房', cls: 'special' }
      }
      const roomType = String(this.roomInfo.roomType || '').toUpperCase()
      if (roomType === 'MULTI_MATCH_SONG') {
        return { key: 'match', label: '公开匹配房', cls: 'public' }
      }
      if (roomType === 'FOLLOW_LISTEN') {
        return { key: 'follow', label: '关注一起听', cls: 'public' }
      }
      const biz = Number(this.roomInfo.roomBizType)
      if (biz === 1)
        return { key: 'private', label: '私密好友房', cls: 'private' }
      if (biz === 2)
        return { key: 'public-friend', label: '公开好友房', cls: 'public' }
      return { key: 'unknown', label: '房间', cls: 'other' }
    },

    /* ---------------- 播放 ---------------- */
    progressMax() {
      return Math.max(
        1,
        Number(this.audioDuration) || 0,
        Number(this.playingInfo.duration) || 0,
      )
    },

    progressPercent() {
      const max = this.progressMax || 1
      return util.clamp((this.audioCurrentTime / max) * 100, 0, 100)
    },

    songName() {
      return (
        this.playingInfo.name ||
        (this.playingInfo.songId ? '加载中…' : '暂无歌曲')
      )
    },

    songArtist() {
      return (
        this.playingInfo.artist ||
        (this.playingInfo.songId ? '加载中…' : '等待房间同步')
      )
    },

    songNameLong() {
      return Array.from(String(this.songName || '')).length > 26
    },

    songArtistLong() {
      return Array.from(String(this.songArtist || '')).length > 20
    },

    currentSongUrl() {
      return this.playingInfo.songId
        ? `https://music.163.com/song?id=${encodeURIComponent(this.playingInfo.songId)}`
        : ''
    },

    currentSongSource() {
      return this.songSource({ songRcmdUid: this.playingInfo.songRcmdUid })
    },

    ambientStyle() {
      const cover = this.playingInfo.cover
      if (!cover) return {}
      const sized = util.imageUrl(cover, 240)
      const safe = String(sized).replace(/["'()\\\s]/g, '')
      return { backgroundImage: `url("${safe}")` }
    },

    cooldownLeft() {
      const until = Number(this.cooldownUntil) || 0
      if (!until) return 0
      return Math.max(0, Math.ceil((until - this.clock) / 1000))
    },

    canAddSong() {
      return !!this.roomInfo.permission.addSong && this.cooldownLeft <= 0
    },

    /* ---------------- 大厅 / 匹配 ---------------- */
    matchSong() {
      return this.selectedSong || this.lastSelectedSong || null
    },

    canMatch() {
      return !!this.matchSong && !this.isMatching && !this.rematching
    },

    matchSeconds() {
      if (!this.matchStartedAt) return 0
      return Math.max(0, Math.floor((this.clock - this.matchStartedAt) / 1000))
    },

    selectedSongId() {
      return Number(this.selectedSong?.id || this.inputSongId) || 0
    },

    /* ---------------- 聊天 ---------------- */
    myStickers() {
      const result = []
      const seen = new Set()
      for (const item of [
        ...LISTEN_STICKERS,
        ...this.cloudStickers,
        ...this.savedStickers,
      ]) {
        const emoji = this.normalizeSticker(item)
        if (!emoji || seen.has(emoji.emojiImgUrl)) continue
        seen.add(emoji.emojiImgUrl)
        result.push(emoji)
      }
      return result
    },

    builtinStickers() {
      return LISTEN_STICKERS
    },

    mentionCandidates() {
      if (!this.mentionOpen) return []
      const query = String(this.mentionQuery || '').toLowerCase()
      return (this.roomInfo.roomUsers || [])
        .filter((user) => {
          const name = String(user.nickname || '')
          if (!name) return false
          return !query || name.toLowerCase().includes(query)
        })
        .slice(0, 8)
    },

    chatNewIndex() {
      const anchor = this.chatUnreadAnchor
      if (!anchor) return -1
      return this.chatHistory.findIndex(
        (msg) => String(msg.id) === String(anchor),
      )
    },

    lyricsActiveIndex() {
      const lines = this.lyrics.lines
      if (!lines.length) return -1
      const time = Number(this.audioCurrentTime) || 0
      let index = -1
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].time <= time) index = i
        else break
      }
      return index
    },

    /* ---------------- 登录 ---------------- */
    qrTone() {
      const status = this.qr.status
      if (status === 'success') return 'ok'
      if (status === 'expired' || status === 'error') return 'error'
      return 'waiting'
    },
  }

  window.LT.computed = computed
})()

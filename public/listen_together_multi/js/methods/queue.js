/**
 * 队列：待播刷新 + 已播历史分页
 */
;(function () {
  'use strict'

  const { api, log } = window.LT

  const queueMethods = {
    refreshQueue() {
      this.fetchFullQueue().catch(() => {})
      if (this.queueTab === 'played') this.fetchPlayed(true).catch(() => {})
      this.toast('正在刷新队列', 'info', 1200)
    },

    setQueueTab(tab) {
      this.queueTab = tab === 'played' ? 'played' : 'wait'
      if (this.queueTab === 'played' && !this.playedLoaded) {
        this.fetchPlayed(true).catch(() => {})
      }
    },

    async fetchPlayed(reset = false) {
      const roomId = this.roomInfo.roomId
      if (!roomId || this.playedLoading) return
      const generation = this.pollGeneration
      if (reset) {
        this.playedSongs = []
        this.playedCursor = ''
        this.playedMore = false
        this.playedLoaded = false
      }
      this.playedLoading = true
      try {
        const page = { size: 30 }
        if (this.playedCursor) page.cursor = this.playedCursor
        const res = await api({
          url: '/listentogether/multi/match/played/song/list',
          method: 'post',
          data: {
            roomId,
            sort: 1,
            page: JSON.stringify(page),
            cookie: this.getFakeAndroidCookie(),
          },
        })
        if (
          generation !== this.pollGeneration ||
          String(roomId) !== String(this.roomInfo.roomId)
        )
          return
        if (res.data.code !== 200) {
          throw new Error(res.data.message || '已播列表读取失败')
        }
        const data = res.data.data || {}
        const rows = data.records || data.songLists || data.list || []
        const mapped = rows
          .map((row) => this.normalizePlayedRecord(row))
          .filter(Boolean)
        const seen = new Set(
          this.playedSongs.map((song) => `${song.bizId}:${song.songId}`),
        )
        for (const song of mapped) {
          const key = `${song.bizId}:${song.songId}`
          if (seen.has(key)) continue
          seen.add(key)
          this.playedSongs.push(song)
        }
        this.playedCursor = data.page?.cursor || ''
        this.playedMore = data.page?.more === true
        this.playedLoaded = true
      } catch (e) {
        log('error', 'Queue', '读取失败', e?.message || e)
        if (!this.playedSongs.length) {
          this.playedMore = false
        }
        this.toast('已播记录读取失败：' + (e.message || e), 'error')
      } finally {
        this.playedLoading = false
      }
    },

    normalizePlayedRecord(row) {
      if (!row) return null
      const info = row.songInfo || row.playSong || row.song || row
      const songId = Number(info.resourceId || info.songId || row.songId || 0)
      if (!songId) return null
      const bizId = String(info.bizId || row.bizId || `${songId}`)
      const artist = Array.isArray(info.artistName)
        ? info.artistName.join(' / ')
        : info.artistName || info.artist || ''
      const source = this.songSource({
        songRcmdUid: Number(row.rcmdUid ?? info.songRcmdUid ?? 0),
      })
      return {
        songId,
        bizId,
        name: info.title || info.name || '未知歌曲',
        artist,
        cover: info.coverUrl || info.cover || info.picUrl || '',
        songRcmdUid: Number(row.rcmdUid ?? info.songRcmdUid ?? 0),
        isMine: source.isMine,
        playTime: Number(row.playTime || row.playEndTime || row.endTime || 0),
      }
    },

    loadMorePlayed() {
      if (!this.playedMore || this.playedLoading) return
      this.fetchPlayed(false)
    },
  }

  window.LT.queueMethods = queueMethods
})()

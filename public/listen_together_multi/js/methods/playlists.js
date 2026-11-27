/**
 * 歌单：读取我创建 / 收藏的歌单、加载歌单歌曲、把歌曲收藏到歌单
 */
;(function () {
  'use strict'

  const { api, log } = window.LT

  function mapTrack(track) {
    if (!track || !track.id) return null
    return {
      id: String(track.id),
      name: track.name || '未知歌曲',
      artist: (track.ar || [])
        .map((artist) => artist && artist.name)
        .filter(Boolean)
        .join(' / '),
      cover: (track.al && track.al.picUrl) || '',
      duration: Number(track.dt) || 0,
    }
  }

  function mapPlaylist(playlist, meUid) {
    if (!playlist || !playlist.id) return null
    const creatorId = Number(playlist.creator && playlist.creator.userId) || 0
    return {
      id: String(playlist.id),
      name: playlist.name || '未命名歌单',
      cover: playlist.coverImgUrl || '',
      trackCount: Number(playlist.trackCount) || 0,
      creatorId,
      subscribed:
        playlist.subscribed === true ||
        (creatorId > 0 && meUid > 0 && creatorId !== Number(meUid)),
      specialType: Number(playlist.specialType) || 0,
    }
  }

  const playlistsMethods = {
    /* ---------------- 我的歌单 ---------------- */

    async loadMyPlaylists(force = false) {
      if (this.mockMode && window.LT.mockPlaylists) {
        this.myPlaylists = window.LT.mockPlaylists
        this.myPlaylistsLoaded = true
        this.myPlaylistsLoading = false
        this.myPlaylistsError = ''
        return
      }
      if (this.myPlaylistsLoaded && !force) return
      if (this.myPlaylistsLoading) return
      const uid = Number(this.account.userId) || 0
      if (!uid) {
        this.myPlaylistsError = '请先登录后再读取歌单'
        this.myPlaylistsLoaded = true
        return
      }
      this.myPlaylistsLoading = true
      this.myPlaylistsError = ''
      try {
        const res = await api({
          url: '/user/playlist',
          method: 'get',
          params: {
            uid,
            limit: 1000,
            cookie: this.getFakeAndroidCookie(),
            mergeCookie: 'body',
          },
        })
        const body = res.data || {}
        const list = body.playlist || body.data?.playlist || []
        const mapped = list
          .map((item) => mapPlaylist(item, uid))
          .filter(Boolean)
        // 我创建的在前面，收藏的在后
        mapped.sort((a, b) => {
          if (a.subscribed !== b.subscribed) return a.subscribed ? 1 : -1
          return a.name.localeCompare(b.name, 'zh-Hans-CN')
        })
        this.myPlaylists = mapped
        this.myPlaylistsLoaded = true
      } catch (e) {
        log('Playlist', '读取歌单失败', e?.message || e)
        this.myPlaylistsError =
          '歌单读取失败：' +
          (e.response?.data?.message || e.message || '未知错误')
      } finally {
        this.myPlaylistsLoading = false
      }
    },

    /* ---------------- 歌单歌曲 ---------------- */

    async openPlaylist(playlist) {
      if (!playlist || !playlist.id) return
      // 换歌单时作废上一个歌单仍在途的分页请求
      this._playlistEpoch = (this._playlistEpoch || 0) + 1
      this.activePlaylistLoading = false
      if (this.mockMode && window.LT.mockPlaylistTracks) {
        this.activePlaylist = playlist
        this.activePlaylistTracks = window.LT.mockPlaylistTracks
        this.activePlaylistOffset = window.LT.mockPlaylistTracks.length
        this.activePlaylistMore = false
        this.activePlaylistError = ''
        return
      }
      this.activePlaylist = playlist
      this.activePlaylistTracks = []
      this.activePlaylistOffset = 0
      this.activePlaylistMore = false
      this.activePlaylistError = ''
      this.resetPickerScroll()
      await this.loadPlaylistTracks(true)
    },

    async loadPlaylistTracks(reset = false) {
      const playlist = this.activePlaylist
      if (!playlist) return
      if (this.activePlaylistLoading && !reset) return
      // reset（首次进入 / 重新读取）开启新一代请求，旧响应直接丢弃；
      // 分页请求沿用当前代际，避免两页交错。
      const epoch = reset
        ? (this._playlistEpoch = (this._playlistEpoch || 0) + 1)
        : this._playlistEpoch || 0
      if (reset) {
        this.activePlaylistTracks = []
        this.activePlaylistOffset = 0
        this.activePlaylistMore = false
      }
      const limit = 100
      this.activePlaylistLoading = true
      try {
        const res = await api({
          url: '/playlist/track/all',
          method: 'get',
          params: {
            id: playlist.id,
            limit,
            offset: this.activePlaylistOffset,
            cookie: this.getFakeAndroidCookie(),
            mergeCookie: 'body',
          },
        })
        if (
          epoch !== (this._playlistEpoch || 0) ||
          this.activePlaylist !== playlist
        )
          return
        const songs = res.data?.songs || []
        const mapped = songs.map(mapTrack).filter(Boolean)
        const seen = new Set(this.activePlaylistTracks.map((song) => song.id))
        for (const song of mapped) {
          if (seen.has(song.id)) continue
          seen.add(song.id)
          this.activePlaylistTracks.push(song)
        }
        this.activePlaylistOffset += mapped.length
        this.activePlaylistMore =
          mapped.length >= limit &&
          this.activePlaylistOffset < (playlist.trackCount || Infinity)
      } catch (e) {
        if (epoch === (this._playlistEpoch || 0)) {
          log('Playlist', '读取歌单歌曲失败', e?.message || e)
          this.activePlaylistError =
            '歌单歌曲读取失败：' +
            (e.response?.data?.message || e.message || '未知错误')
        }
      } finally {
        if (epoch === (this._playlistEpoch || 0)) {
          this.activePlaylistLoading = false
        }
      }
    },

    loadMorePlaylistTracks() {
      if (!this.activePlaylistMore || this.activePlaylistLoading) return
      this.loadPlaylistTracks(false)
    },

    onPickerScroll(event) {
      const el = event && event.target
      if (!el) return
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight
      if (distance > 120) return
      if (
        this.pickerTab === 'playlists' &&
        this.activePlaylist &&
        this.activePlaylistMore &&
        !this.activePlaylistLoading
      ) {
        this.loadMorePlaylistTracks()
        return
      }
      if (
        this.pickerTab === 'search' &&
        this.searchMore &&
        !this.songSearching
      ) {
        this.loadMoreSearch()
      }
    },

    resetPickerScroll() {
      this.$nextTick(() => {
        const el = this.$refs.pickerList
        if (el) el.scrollTop = 0
      })
    },

    closePlaylist() {
      this._playlistEpoch = (this._playlistEpoch || 0) + 1
      this.activePlaylistLoading = false
      this.activePlaylist = null
      this.activePlaylistTracks = []
      this.activePlaylistOffset = 0
      this.activePlaylistMore = false
      this.activePlaylistError = ''
      this.resetPickerScroll()
    },

    setPickerTab(tab) {
      this.pickerTab = tab === 'playlists' ? 'playlists' : 'search'
      if (this.pickerTab === 'playlists') this.loadMyPlaylists()
    },

    /* ---------------- 收藏到歌单 ---------------- */

    openCollectSheet(song) {
      const target = song || {
        id: String(this.playingInfo.songId || ''),
        name: this.playingInfo.name,
        artist: this.playingInfo.artist,
        cover: this.playingInfo.cover,
        duration: Number(this.playingInfo.duration) || 0,
      }
      if (!target.id) {
        this.toast('当前没有可收藏的歌曲', 'warn')
        return
      }
      this.collectSong = target
      this.collectOpen = true
      this.collectError = ''
      this.loadMyPlaylists()
    },

    closeCollectSheet() {
      this.collectOpen = false
      this.collectSong = null
      this.collectError = ''
    },

    async addSongToPlaylist(song, playlist) {
      if (!song || !song.id || !playlist || !playlist.id) return false
      if (!this.account.userId) {
        this.toast('请先登录', 'warn')
        return false
      }
      if (this.collectLoading) return false
      this.collectLoading = true
      this.collectError = ''
      try {
        const res = await api({
          url: '/playlist/tracks',
          method: 'post',
          data: {
            op: 'add',
            pid: playlist.id,
            tracks: String(song.id),
            cookie: this.getFakeAndroidCookie(),
          },
        })
        const body = res.data || {}
        const inner = body.body || {}
        const code = Number(body.code || inner.code || body.status)
        if (code !== 200) {
          throw new Error(
            body.message || inner.message || `接口返回 ${code || '未知错误'}`,
          )
        }
        this.toast(`已收藏到「${playlist.name}」`, 'ok')
        if (playlist.id && playlist.trackCount !== undefined) {
          playlist.trackCount = Number(playlist.trackCount) + 1
        }
        return true
      } catch (e) {
        const message =
          e.response?.data?.message || e.message || '收藏失败，请稍后重试'
        this.collectError = message
        this.toast('收藏失败：' + message, 'error')
        return false
      } finally {
        this.collectLoading = false
      }
    },

    /* ---------------- 长按红心 ---------------- */

    startLikeLongPress() {
      this._likeHold = false
      clearTimeout(this._likeTimer)
      this._likeTimer = setTimeout(() => {
        this._likeHold = true
        this.openCollectSheet()
      }, 520)
    },

    cancelLikeLongPress() {
      clearTimeout(this._likeTimer)
    },

    endLikeLongPress() {
      clearTimeout(this._likeTimer)
    },

    onLikeClick() {
      if (this._likeHold) {
        this._likeHold = false
        return
      }
      this.toggleLikeCurrentSong()
    },

    openCollectMenu(event) {
      if (event && event.preventDefault) event.preventDefault()
      this.openCollectSheet()
    },
  }

  window.LT.playlistsMethods = playlistsMethods
})()

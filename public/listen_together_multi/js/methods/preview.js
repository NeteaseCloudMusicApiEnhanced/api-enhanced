/**
 * 选歌预览：标准音质试听，可拖动进度、可暂停
 */
;(function () {
  'use strict'

  const { api, log } = window.LT

  const EMPTY_PREVIEW = {
    songId: 0,
    url: '',
    loading: false,
    playing: false,
    current: 0,
    duration: 0,
    error: '',
    trial: false,
  }

  const previewMethods = {
    previewAudio() {
      return document.getElementById('previewAudio')
    },

    emptyPreview() {
      return Object.assign({}, EMPTY_PREVIEW)
    },

    /** 选中歌曲后自动试听；再次点击同一首则播放/暂停 */
    async previewSelectedSong(song) {
      const audio = this.previewAudio()
      if (!audio || !song || !song.id) return
      const songId = Number(song.id)
      if (this.preview.songId === songId && this.preview.url) {
        this.togglePreview()
        return
      }
      const epoch = (this._previewEpoch = (this._previewEpoch || 0) + 1)
      // 切到另一首试听前先停掉旧音源，否则新音源加载/失败期间旧歌还在响，
      // 而底部试听条已经换成新歌，用户无法暂停它
      audio.pause()
      audio.removeAttribute('src')
      try {
        audio.load()
      } catch (e) {}
      this.preview = Object.assign(this.emptyPreview(), {
        songId,
        loading: true,
        duration:
          Number(song.duration) > 1000
            ? Number(song.duration) / 1000
            : Number(song.duration) || 0,
      })
      try {
        const res = await api({
          url: '/song/url/v1',
          method: 'get',
          params: {
            id: String(song.id),
            level: 'standard',
            cookie: this.getFakeAndroidCookie(),
          },
        })
        const item = res.data?.data?.[0]
        if (epoch !== this._previewEpoch || !this.songOpen) return
        if (this.preview.songId !== songId) return
        if (!item || !item.url) throw new Error('这首歌暂时没有可试听的音源')
        this.preview.url = item.url
        this.preview.trial = !!item.freeTrialInfo
        audio.src = item.url
        try {
          audio.currentTime = 0
        } catch (e) {}
        const roomVolume = Number(this.audioVolume) || 0
        audio.volume = roomVolume > 0 ? Math.min(1, roomVolume) : 0.8
        // 先把房间静音，再开始试听，避免 play 事件延迟导致两路混音
        this.muteRoomForPreview()
        try {
          await audio.play()
        } catch (e) {
          this.restoreRoomForPreview()
          this.toast('浏览器拦截了自动试听，请点播放', 'warn')
        }
      } catch (e) {
        log('error', 'Preview', '试听加载失败', e?.message || e)
        this.preview.error =
          e.response?.data?.message || e.message || '试听加载失败'
      } finally {
        if (this.preview.songId === songId) this.preview.loading = false
      }
    },

    togglePreview() {
      const audio = this.previewAudio()
      if (!audio) return
      if (!audio.src) {
        // 关闭弹窗时 stopPreview() 会清掉音源；再次打开后 selectedSong 仍在，
        // 底部试听条也会显示。此时点播放应重新拉一次试听音源，而不是静默返回。
        if (this.selectedSong && !this.preview.loading) {
          this.previewSelectedSong(this.selectedSong)
        }
        return
      }
      if (audio.paused) {
        this.muteRoomForPreview()
        audio.play().catch(() => {
          this.restoreRoomForPreview()
          this.toast('试听失败，请重试', 'error')
        })
      } else {
        audio.pause()
        this.restoreRoomForPreview()
      }
    },

    onPreviewSeek(event) {
      const audio = this.previewAudio()
      const value = Math.max(0, Number(event.target.value) || 0)
      this.preview.current = value
      if (!audio) return
      try {
        audio.currentTime = value
      } catch (e) {}
    },

    stopPreview() {
      this._previewEpoch = (this._previewEpoch || 0) + 1
      const audio = this.previewAudio()
      if (audio) {
        audio.pause()
        audio.removeAttribute('src')
        try {
          audio.load()
        } catch (e) {}
      }
      this.preview = this.emptyPreview()
      this.restoreRoomForPreview(true)
    },

    syncPreviewAudio() {
      const audio = this.previewAudio()
      if (!audio) return
      this.preview.current = Number(audio.currentTime) || 0
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        this.preview.duration = audio.duration
      }
      this.preview.playing = !audio.paused && !audio.ended
      this.preview.loading = false
      // 试听期间暂时静音房间音频，暂停 / 结束 / 关闭弹窗后恢复
      if (this.preview.playing && this.songOpen) {
        this.muteRoomForPreview()
        return
      }
      if (this.preview.playing && !this.songOpen) {
        // 弹窗已关闭却还在播放（例如音源在关窗后才返回），立即停掉
        try {
          audio.pause()
        } catch (e) {}
      }
      this.restoreRoomForPreview()
    },

    muteRoomForPreview() {
      const player = document.getElementById('player')
      if (!player) return
      if (player.volume > 0) {
        this._previewPrevVolume = Number(player.volume) || 0
      }
      this._previewMutedRoom = true
      player.volume = 0
    },

    restoreRoomForPreview(force = false) {
      const player = document.getElementById('player')
      if (!player) return
      if (!this._previewMutedRoom && !force) return
      this._previewMutedRoom = false
      const volume = Math.min(1, Math.max(0, Number(this.audioVolume)))
      player.volume = volume > 0 ? volume : 0
    },

    previewPercent() {
      const total = Number(this.preview.duration) || 0
      if (!total) return 0
      return Math.min(100, Math.max(0, (this.preview.current / total) * 100))
    },
  }

  window.LT.previewMethods = previewMethods
})()

;(function () {
  'use strict'

  function mounted() {
    const { log } = window.LT

    this._booted = false
    try {
      const themeParam = new URLSearchParams(location.search).get('theme')
      if (['dark', 'light', 'auto'].includes(themeParam))
        this.theme = themeParam
    } catch (e) {}
    this.applyTheme()
    this.chatOpen = this.isWideViewport() || this.pane === 'chat'

    /* ---------- 日志与状态 ---------- */

    this.logEntries = (window.LT.logs || []).slice(-300)
    window.addEventListener('lt-log', this.onLogEvent)

    this.$watch('message', (value, previous) => {
      if (!value || value === previous) return
      this.pushLog('status', value)
      if (!this._booted) return
      const now = Date.now()
      if (this._lastToast === value && now - this._lastToastAt < 4000) return
      this._lastToast = value
      this._lastToastAt = now
      const type = /失败|异常|错误|不可|没有|无权|超时|拒绝|拦截|不支持/.test(
        value,
      )
        ? 'error'
        : /成功|已复制|已进入|已加入|已完成/.test(value)
          ? 'ok'
          : 'info'
      this.toast(value, type)
    })

    this.$watch(
      'nextAddSongDuration',
      (value) => this.syncCooldownFromDuration(value),
      { immediate: true },
    )

    this.$watch('account.login', (login) => {
      if (!login) return
      this.maybeShowPendingInvite()
    })

    this.$watch('roomInfo.chatRoomId', (id) => {
      if (id && this.roomInfo.roomId) this.autoConnectIm()
    })

    this.$watch(
      'roomInfo.roomId',
      (roomId) => {
        if (roomId) {
          this.pane = 'stage'
          this.chatAtBottom = true
          this.restoreChatDraft()
          if (this.enrichMembersFromLanding) this.enrichMembersFromLanding()
        } else {
          this.stopPolling()
          if (this.stopPreview) this.stopPreview()
        }
      },
      { immediate: true },
    )

    this.$watch(
      () => [
        this.playingInfo.name,
        this.playingInfo.artist,
        this.playingInfo.cover,
      ],
      () => this.updateMediaSession(),
      { immediate: true },
    )

    /* ---------- 计时 ---------- */

    this._clockTimer = setInterval(() => {
      this.clock = Date.now()
    }, 1000)

    /* ---------- 主题 / 尺寸 ---------- */

    this._media = window.matchMedia('(prefers-color-scheme: dark)')
    this._onMediaChange = () => this.applyTheme()
    if (this._media.addEventListener) {
      this._media.addEventListener('change', this._onMediaChange)
    } else if (this._media.addListener) {
      this._media.addListener(this._onMediaChange)
    }

    this._onResize = () => {
      if (this.isWideViewport()) this.chatOpen = true
      else this.chatOpen = this.pane === 'chat'
    }
    window.addEventListener('resize', this._onResize)

    /* ---------- 快捷键 ---------- */

    this._onKeydown = (event) => this.handleGlobalKeydown(event)
    window.addEventListener('keydown', this._onKeydown)

    /* ---------- 回到前台时补一次同步 ---------- */

    this._onVisibility = () => {
      if (document.visibilityState !== 'visible') return
      if (!this.roomInfo.roomId) return
      this.fetchStatus().catch(() => {})
      this.fetchChat().catch(() => {})
    }
    document.addEventListener('visibilitychange', this._onVisibility)

    /* ---------- 未读锚点：打开聊天即清零 ---------- */

    this.$watch('pane', (pane) => {
      if (pane === 'chat') this.openChat()
      else if (this.isWideViewport()) this.chatOpen = true
      else this.chatOpen = false
    })

    /* ---------- 音频元素 ---------- */

    const audio = document.getElementById('player')
    if (audio) {
      audio.volume = this.audioVolume
      const syncAudio = () => {
        if (this.audioSwitching) return
        this.audioCurrentTime = Number(audio.currentTime) || 0
        this.audioDuration =
          Number.isFinite(audio.duration) && audio.duration > 0
            ? audio.duration
            : Number(this.playingInfo.duration) || 0
        this.audioPlaying = !audio.paused && !audio.ended
      }
      ;[
        'timeupdate',
        'play',
        'pause',
        'loadedmetadata',
        'volumechange',
      ].forEach((event) => audio.addEventListener(event, syncAudio))
      audio.onerror = () => {
        this.audioSwitching = false
        this.audioPlaying = false
        if (audio.src) log('Audio', '加载失败', audio.src)
      }
      audio.onended = () => {
        syncAudio()
        if (this.roomInfo.roomId) {
          log('Audio', '播放结束，立即触发心跳同步下一首')
          this.lastHeartbeatTime = Date.now()
          this.heartbeat().catch(() => {})
        }
      }
      if (!window.LT.MOCK) syncAudio()
    }

    const previewAudio = document.getElementById('previewAudio')
    if (previewAudio) {
      ;['timeupdate', 'play', 'pause', 'loadedmetadata', 'ended'].forEach(
        (event) =>
          previewAudio.addEventListener(event, () => {
            if (this.syncPreviewAudio) this.syncPreviewAudio()
          }),
      )
    }

    const unlockAudio = () => {
      const player = document.getElementById('player')
      if (
        player &&
        player.paused &&
        !player.ended &&
        !this.localPaused &&
        this.playingInfo.songId &&
        this.playingInfo.audioSrc &&
        this.playingInfo.status !== 'PAUSE'
      ) {
        player
          .play()
          .then(() => {
            if (
              this.message.includes('拦截') ||
              this.message.includes('点击')
            ) {
              this.message = '播放中'
            }
          })
          .catch(() => {})
      }
    }
    document.body.addEventListener('click', unlockAudio)
    document.body.addEventListener('touchstart', unlockAudio, { passive: true })

    /* ---------- 启动 ---------- */

    const invite = this.readInviteFromUrl()
    if (invite) this._pendingInvite = invite

    this.pushLog('app', '控制台已加载')

    if (window.LT.MOCK) {
      this.mockMode = true
      this._booted = true
      this.$nextTick(() => {
        if (window.LT.MOCK === 'chat') this.setPane('chat')
        if (window.LT.applyMockUi) window.LT.applyMockUi()
      })
      return
    }

    this.init()
      .catch((e) => log('Init', '初始化失败', e?.message || e))
      .finally(() => {
        this._booted = true
        if (this.account.login) this.maybeShowPendingInvite()
      })
  }

  window.LT.mounted = mounted
})()

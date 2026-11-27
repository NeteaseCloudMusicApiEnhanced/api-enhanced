/**
 * 界面与系统集成：主题、沉浸模式、快捷键、Media Session、扫码登录
 */
;(function () {
  'use strict'

  const { api, log, safeStorage, util } = window.LT

  const uiMethods = {
    /* ---------------- 主题 ---------------- */

    setTheme(theme) {
      const next = ['auto', 'dark', 'light'].includes(theme) ? theme : 'auto'
      this.theme = next
      safeStorage.set('lt_theme', next)
      this.applyTheme()
    },

    cycleTheme() {
      const order = ['auto', 'dark', 'light']
      const index = order.indexOf(this.theme)
      this.setTheme(order[(index + 1) % order.length])
    },

    applyTheme() {
      this.systemDark = window.matchMedia(
        '(prefers-color-scheme: dark)',
      ).matches
      const meta = document.querySelector('meta[name="theme-color"]')
      if (meta)
        meta.setAttribute(
          'content',
          this.resolvedTheme === 'dark' ? '#0b0c10' : '#f2f3f6',
        )
    },

    onQualitySelect(valueOrEvent) {
      const value =
        typeof valueOrEvent === 'string'
          ? valueOrEvent
          : valueOrEvent && valueOrEvent.target
            ? valueOrEvent.target.value
            : ''
      if (!value) return
      this.audioLevel = value
      this.qualityMenuOpen = false
      this.onLevelChange()
    },

    /* ---------------- 沉浸模式 ---------------- */

    toggleImmersive() {
      this.immersive = !this.immersive
      this.pane = 'stage'
      this.leaveMenuOpen = false
      if (this.immersive && !this.lyricsOpen) {
        this.lyricsOpen = true
        this.loadLyrics()
      }
    },

    /* ---------------- 扫码登录 ---------------- */

    stopQrLogin(status, text) {
      if (this._qrTimer) {
        clearInterval(this._qrTimer)
        this._qrTimer = null
      }
      if (status) {
        this.qr.status = status
        this.qr.text = text
      }
    },

    /** 先确认是否已有登录态，避免明明已登录还去轮询二维码 */
    async ensureLoginThenQr() {
      if (this.account.login) {
        this.stopQrLogin()
        return
      }
      if (this.qr.status !== 'idle' && this.qr.img) return
      const ok = await this.login(true)
      if (ok || this.account.login) {
        this.stopQrLogin()
        return
      }
      if (!this.account.login) this.startQrLogin()
    },

    async startQrLogin() {
      if (this.account.login) {
        this.stopQrLogin()
        return
      }
      this.stopQrLogin()
      this.qr = { img: '', status: 'loading', text: '正在获取二维码…', key: '' }
      try {
        const keyRes = await api({ url: '/login/qr/key', method: 'get' })
        const key = keyRes.data?.data?.unikey
        if (!key) throw new Error('未获取到二维码 key')
        const createRes = await api({
          url: '/login/qr/create',
          method: 'get',
          params: { key, platform: 'web', qrimg: true, ua: 'pc' },
        })
        const img = createRes.data?.data?.qrimg || ''
        if (!img) throw new Error('二维码生成失败')
        this.qr = {
          img,
          status: 'waiting',
          text: '请用网易云音乐 App 扫码',
          key,
        }
        this._qrTimer = setInterval(() => this.pollQrLogin(key), 3000)
      } catch (e) {
        log('QR', '二维码获取失败', e?.message || e)
        this.qr = {
          img: '',
          status: 'error',
          text: '二维码加载失败：' + (e.message || e),
          key: '',
        }
      }
    },

    async pollQrLogin(key) {
      try {
        const res = await api({
          url: '/login/qr/check',
          method: 'get',
          params: { key, ua: 'pc' },
        })
        const code = res.data?.code
        if (code === 800) {
          this.stopQrLogin('expired', '二维码已过期，请重新获取')
          return
        }
        if (code === 801) {
          this.qr.status = 'waiting'
          this.qr.text = '等待扫码…'
          return
        }
        if (code === 802) {
          this.qr.status = 'scanned'
          this.qr.text = '已扫码，请在手机上确认'
          return
        }
        if (code === 803) {
          this.stopQrLogin('success', '登录成功，正在进入…')
          await this.login(true)
          if (!this.account.login) {
            this.qr.status = 'error'
            this.qr.text = '扫码成功但读取登录态失败，请点「我已登录」重试'
          }
        }
      } catch (e) {
        log('QR', '扫码状态查询失败', e?.message || e)
      }
    },

    /* ---------------- 系统媒体控制 ---------------- */

    updateMediaSession() {
      if (typeof navigator === 'undefined' || !('mediaSession' in navigator))
        return
      const info = this.playingInfo
      try {
        if (!info.songId) {
          navigator.mediaSession.metadata = null
          return
        }
        navigator.mediaSession.metadata = new MediaMetadata({
          title: info.name || '一起听',
          artist: info.artist || '',
          album: '一起听 · 多人房间',
          artwork: info.cover
            ? [{ src: info.cover, sizes: '512x512', type: 'image/jpeg' }]
            : [],
        })
        // play / pause 是明确的意图，不能复用 toggle，否则系统重复发送同一
        // 指令时会把已播放变成暂停
        navigator.mediaSession.setActionHandler('play', () => {
          const audio = document.getElementById('player')
          if (audio && audio.paused) this.togglePlay()
        })
        navigator.mediaSession.setActionHandler('pause', () => {
          const audio = document.getElementById('player')
          if (audio && !audio.paused) this.togglePlay()
        })
        navigator.mediaSession.setActionHandler('nexttrack', () =>
          this.nextSong(),
        )
      } catch (e) {
        log('MediaSession', '设置失败', e?.message || e)
      }
    },

    /* ---------------- 快捷键 ---------------- */

    isTypingTarget(target) {
      if (!target || !(target instanceof Element)) return false
      const tag = target.tagName
      return (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        target.isContentEditable
      )
    },

    handleGlobalKeydown(event) {
      if (event.defaultPrevented) return
      // 输入法组合中按 Esc 只是取消候选词，不能关掉整个弹窗
      if (event.isComposing || event.keyCode === 229) return
      if (event.key === 'Escape') {
        // 按 DOM/视觉层级从高到低关闭，保证一次 Esc 只关最上面一层
        if (this.landingInfo) return this.dismissLanding()
        if (this.debugOpen) return (this.debugOpen = false)
        if (this.settingsOpen) return (this.settingsOpen = false)
        if (this.collectOpen) return this.closeCollectSheet()
        if (this.inviteOpen) return (this.inviteOpen = false)
        if (this.shareOpen) return (this.shareOpen = false)
        if (this.songOpen) return this.closeSongDialog()
        if (this.membersOpen) return (this.membersOpen = false)
        if (this.qualityMenuOpen) return (this.qualityMenuOpen = false)
        if (this.emojiPickerOpen) return (this.emojiPickerOpen = false)
        if (this.mentionOpen) return (this.mentionOpen = false)
        if (this.leaveMenuOpen) return (this.leaveMenuOpen = false)
        if (this.immersive) return this.toggleImmersive()
        return
      }

      if (!this.account.login) return
      // 有弹层时不再响应房间快捷键，避免在弹层背后打开另一个弹层
      if (
        this.landingInfo ||
        this.debugOpen ||
        this.settingsOpen ||
        this.collectOpen ||
        this.inviteOpen ||
        this.shareOpen ||
        this.songOpen ||
        this.membersOpen
      )
        return
      if (this.isTypingTarget(event.target)) return
      if (event.metaKey || event.ctrlKey || event.altKey) return

      if (event.code === 'Space') {
        event.preventDefault()
        this.togglePlay()
        return
      }
      if (event.key === '/') {
        event.preventDefault()
        this.openSongDialog('add')
        return
      }
      if (event.key === 'm' || event.key === 'M') {
        this.toggleMute()
        return
      }
      if (event.key === 'l' || event.key === 'L') {
        this.toggleLyrics()
        return
      }
      if (event.key === '?') {
        this.settingsOpen = !this.settingsOpen
      }
    },

    /* ---------------- 冷却倒计时 ---------------- */

    syncCooldownFromDuration(seconds) {
      const value = Number(seconds) || 0
      if (value > 0) this.cooldownUntil = Date.now() + value * 1000
      else this.cooldownUntil = 0
    },

    /* ---------------- 滚动定位 ---------------- */

    scrollToBottom(selector) {
      this.$nextTick(() => {
        const el = document.querySelector(selector)
        if (el) el.scrollTop = el.scrollHeight
      })
    },
  }

  window.LT.uiMethods = uiMethods
  window.LT.util = util
})()

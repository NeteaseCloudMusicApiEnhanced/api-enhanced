/**
 * 房间视图：主舞台与队列
 */
;(function () {
  'use strict'

  window.LT.components = Object.assign(window.LT.components || {}, {
    'lt-stage': {
      template: '#tpl-stage',
      mounted() {
        if (this.lyricsOpen) this.loadLyrics()
        this._closeQualityMenu = (event) => {
          if (!this.qualityMenuOpen) return
          if (
            event.target instanceof Element &&
            event.target.closest('.lt-quality')
          )
            return
          this.qualityMenuOpen = false
        }
        window.addEventListener('pointerdown', this._closeQualityMenu)
      },
      beforeUnmount() {
        if (this._closeQualityMenu) {
          window.removeEventListener('pointerdown', this._closeQualityMenu)
        }
      },
      watch: {
        lyricsOpen(open) {
          if (!open) return
          this.$nextTick(() => {
            const card = document.querySelector('.lt-lyrics')
            if (card)
              card.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
          })
        },
        'lyrics.lines'() {
          if (!this.lyricsOpen) return
          this.lyricsFollow = true
          // 歌词是异步加载的，布局（尤其沉浸模式）还会再变一次，多补几次定位
          const center = () =>
            this.$nextTick(() => this.scrollLyricsToActive(true))
          center()
          setTimeout(center, 200)
          setTimeout(center, 600)
        },
        immersive() {
          if (!this.lyricsOpen) return
          setTimeout(() => this.scrollLyricsToActive(true), 250)
        },
        lyricsActiveIndex(index) {
          if (!this.lyricsOpen || !this.lyricsFollow) return
          if (index < 0) return
          this.scrollLyricsToActive()
        },
        'playingInfo.songId'(songId) {
          if (!this.lyricsOpen || !songId) return
          this.loadLyrics(true)
        },
        'playingInfo.cover'() {
          this.updateMediaSession()
        },
      },
    },

    'lt-queue': {
      template: '#tpl-queue',
      mounted() {
        if (this.queueTab === 'played' && !this.playedLoaded) {
          this.fetchPlayed(true).catch(() => {})
        }
      },
    },
  })
})()

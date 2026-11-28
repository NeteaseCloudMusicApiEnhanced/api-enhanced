/**
 * 歌词：解析 LRC、跟随播放高亮、手动滚动后暂停跟随
 */
;(function () {
  'use strict'

  const { api, log } = window.LT

  const TIME_TAG = /\[(\d{1,3}):(\d{1,2}(?:\.\d{1,3})?)\]/g

  function parseLrc(raw) {
    const lines = []
    for (const source of String(raw || '').split(/\r?\n/)) {
      const text = source.replace(/\s+$/, '')
      TIME_TAG.lastIndex = 0
      const stamps = []
      let match
      let lastIndex = 0
      while ((match = TIME_TAG.exec(text))) {
        stamps.push(Number(match[1]) * 60 + Number(match[2]))
        lastIndex = TIME_TAG.lastIndex
      }
      if (!stamps.length) continue
      const content = text.slice(lastIndex).trim()
      if (!content) continue
      for (const time of stamps) lines.push({ time, text: content })
    }
    return lines.sort((a, b) => a.time - b.time)
  }

  const lyricsMethods = {
    toggleLyrics() {
      this.lyricsOpen = !this.lyricsOpen
      if (this.lyricsOpen) {
        this.lyricsFollow = true
        this.loadLyrics()
      }
    },

    async loadLyrics(force = false) {
      // ?mock=1 使用注入的歌词，不请求真实接口
      if (window.LT.MOCK) return
      const songId = Number(this.playingInfo.songId) || 0
      if (!songId) {
        this.lyrics = {
          lines: [],
          title: '',
          loading: false,
          error: '还没有开始播放',
          songId: 0,
        }
        return
      }
      if (!force && this.lyrics.songId === songId) return
      this.lyrics = {
        lines: [],
        title: this.playingInfo.name || '',
        loading: true,
        error: '',
        songId,
      }
      try {
        const res = await api({
          url: '/lyric',
          method: 'get',
          params: { id: String(songId) },
        })
        if (this.lyrics.songId !== songId) return
        const body = res.data || {}
        const lines = parseLrc(body?.lrc?.lyric || '')
        const translated = parseLrc(body?.tlyric?.lyric || '')
        if (lines.length && translated.length) {
          const byTime = new Map(
            translated.map((line) => [Math.round(line.time), line.text]),
          )
          for (const line of lines) {
            line.translation = byTime.get(Math.round(line.time)) || ''
          }
        }
        this.lyrics = {
          lines,
          title: this.playingInfo.name || '',
          loading: false,
          error: lines.length
            ? ''
            : body?.nolyric
              ? '纯音乐，请欣赏'
              : '这首歌暂时没有歌词',
          songId,
        }
        if (this.lyricsOpen && this.lyricsFollow) {
          this.$nextTick(() => this.scrollLyricsToActive(true))
        }
      } catch (e) {
        log('error', 'Lyrics', '加载失败', e?.message || e)
        if (this.lyrics.songId === songId) {
          this.lyrics = {
            lines: [],
            title: this.playingInfo.name || '',
            loading: false,
            error: '歌词暂时无法加载',
            songId,
          }
        }
      }
    },

    scrollLyricsToActive(force = false) {
      if (!this.lyricsFollow && !force) return
      const box = this.$refs.lyricsBox
      const list = this.$refs.lyricsList
      const index = this.lyricsActiveIndex
      if (!box || !list || index < 0) return
      const line = list.children[index]
      if (!line) return
      const top =
        box.scrollTop +
        line.getBoundingClientRect().top -
        box.getBoundingClientRect().top -
        box.clientHeight / 2 +
        line.clientHeight / 2
      this._lyricsAutoScrollAt = Date.now()
      // 初次定位（含沉浸模式布局变化后的重定位）用瞬时滚动：
      // 平滑滚动会和祖先容器的滚动动画互相干扰，导致最后停在 0
      const smooth =
        !force && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
      const target = Math.max(0, top)
      if (smooth) {
        box.scrollTo({ top: target, behavior: 'smooth' })
      } else {
        // 初次定位 / 布局变化后重定位：直接改 scrollTop，确保立即生效
        box.scrollTop = target
      }
    },

    onLyricsScroll() {
      // 程序化滚动会触发 scroll，忽略紧随其后的这次事件
      if (Date.now() - (this._lyricsAutoScrollAt || 0) < 500) return
      // 用户手动滚动后暂停跟随，直到点「回到当前」
      this.lyricsFollow = false
    },
  }

  window.LT.lyricsMethods = lyricsMethods
  window.LT.parseLrc = parseLrc
})()

/**
 * 弹层：选歌、分享、邀请、设置、调试、邀请落地预览
 */
;(function () {
  'use strict'

  window.LT.components = Object.assign(window.LT.components || {}, {
    'lt-song-picker': {
      template: '#tpl-song-picker',
      mounted() {
        if (
          this.songDialogMode === 'initial' &&
          !this.selectedSong &&
          this.lastSelectedSong
        ) {
          this.selectedSong = this.lastSelectedSong
          this.inputSongId = String(this.lastSelectedSong.id)
        }
        this.$nextTick(() => {
          this.$refs.songInput?.focus()
        })
      },
      watch: {
        songInput(value) {
          if (!value) this.selectedSong = null
        },
      },
    },

    'lt-share-sheet': {
      template: '#tpl-share',
    },

    'lt-collect-sheet': {
      template: '#tpl-collect',
      mounted() {
        this.loadMyPlaylists()
      },
    },

    'lt-invite-sheet': {
      template: '#tpl-invite',
      mounted() {
        if (this.mockMode && window.LT.mockInvite) {
          this.inviteUsers = window.LT.mockInvite.users
          this.inviteGroups = window.LT.mockInvite.groups
          this.inviteLoading = false
          return
        }
        this.loadInvitePanel()
      },
    },

    'lt-settings': {
      template: '#tpl-settings',
    },

    'lt-debug': {
      template: '#tpl-debug',
    },

    'lt-landing': {
      template: '#tpl-landing',
    },

    'lt-json-view': {
      template: '#tpl-json-view',
      props: ['value'],
      data() {
        return { failed: false, pretty: '' }
      },
      mounted() {
        this._alive = true
        this.renderJson()
      },
      beforeUnmount() {
        this._alive = false
      },
      watch: {
        value() {
          this.renderJson()
        },
      },
      methods: {
        async renderJson() {
          this._alive = true
          this.failed = false
          const host = this.$refs.host
          if (!host) return
          host.innerHTML = ''
          let value = this.value
          if (typeof value === 'string') {
            try {
              value = JSON.parse(value)
            } catch (e) {}
          }
          if (!value || typeof value !== 'object') value = { value }
          try {
            const Formatter = await window.LT.ensureJsonFormatter()
            if (!this._alive || !this.$refs.host) return
            const formatter = new Formatter(value, Infinity, {
              theme: 'dark',
              hoverPreviewEnabled: true,
              hoverPreviewArrayCount: 50,
              hoverPreviewFieldCount: 8,
              animateOpen: false,
              animateClose: false,
              maxArrayItems: 200,
            })
            host.appendChild(formatter.render())
          } catch (e) {
            this.failed = true
            try {
              this.pretty = JSON.stringify(this.value, null, 2)
            } catch (err) {
              this.pretty = String(this.value)
            }
          }
        },
      },
    },
  })
})()

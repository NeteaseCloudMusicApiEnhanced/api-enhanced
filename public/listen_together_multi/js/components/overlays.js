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
  })
})()

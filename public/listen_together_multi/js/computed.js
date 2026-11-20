(function () {
const { LISTEN_STICKERS } = window.LT
const computed = {
          shareUrl() {
            if (!this.roomInfo.roomId) return ''
            const inviterUid =
              this.account.userId || this.roomInfo.creatorId || 0
            return `https://st.music.163.com/listen-together/multishare/index.html?roomId=${encodeURIComponent(this.roomInfo.roomId)}&inviterUid=${encodeURIComponent(inviterUid)}`
          },
          currentSongUrl() {
            return this.playingInfo.songId
              ? `https://music.163.com/song?id=${encodeURIComponent(this.playingInfo.songId)}`
              : ''
          },
          roomStatusText() {
            if (this.isMatching) return '匹配中'
            return this.roomInfo.roomId ? '房间中' : '未加入'
          },
          builtinStickers() {
            return LISTEN_STICKERS
          },
          myStickers() {
            const result = []
            const seen = new Set()
            for (const item of [...this.cloudStickers, ...this.savedStickers]) {
              const emoji = this.normalizeSticker(item)
              if (!emoji || seen.has(emoji.emojiImgUrl)) continue
              seen.add(emoji.emojiImgUrl)
              result.push(emoji)
            }
            return result
          },
          selectedSongId() {
            return Number(this.selectedSong?.id || this.inputSongId) || 0
          },
          currentSongSource() {
            return this.songSource({
              songRcmdUid: this.playingInfo.songRcmdUid,
            })
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
              return {
                key: 'special',
                label: '特殊房 (Special)',
                cls: 'tag-special',
                cooldown: Number(this.nextAddSongDuration) || 0,
              }
            }
            const roomType = String(this.roomInfo.roomType || '').toUpperCase()
            if (roomType === 'MULTI_MATCH_SONG') {
              return {
                key: 'match',
                label: '公开匹配房',
                cls: 'tag-public',
                cooldown: 0,
              }
            }
            if (roomType === 'FOLLOW_LISTEN') {
              return {
                key: 'follow',
                label: '关注一起听',
                cls: 'tag-public',
                cooldown: 0,
              }
            }
            const biz = Number(this.roomInfo.roomBizType)
            if (biz === 1) {
              return {
                key: 'private',
                label: '私密好友房',
                cls: 'tag-private',
                cooldown: 0,
              }
            }
            if (biz === 2) {
              return {
                key: 'public-friend',
                label: '公开好友房',
                cls: 'tag-public',
                cooldown: 0,
              }
            }
            return {
              key: 'unknown',
              label: '房间类型未知',
              cls: 'tag-other',
              cooldown: 0,
            }
          },

          chatDialogStyle() {
            const width = Number(this.viewportWidth) || 1024
            const height = Number(this.viewportHeight) || 768
            if (width <= 600) return {}
            const panelWidth = Math.min(430, width - 32)
            const panelHeight = Math.min(620, height - 100)
            const fab = this.chatButtonPos || { x: 0, y: 0 }
            let left = fab.x + 58 + 12
            if (left + panelWidth > width - 12)
              left = fab.x - panelWidth - 12
            left = Math.max(
              12,
              Math.min(left, Math.max(12, width - panelWidth - 12)),
            )
            let top = fab.y + 58 - panelHeight
            if (top < 12) top = Math.min(fab.y, height - panelHeight - 12)
            top = Math.max(12, Math.min(top, Math.max(12, height - panelHeight - 12)))
            return {
              left: left + 'px',
              top: top + 'px',
              width: panelWidth + 'px',
              height: panelHeight + 'px',
            }
          },
          canAddSong() {
            return (
              !!this.roomInfo.permission.addSong &&
              this.nextAddSongDuration <= 0
            )
          },
        }

window.LT.computed = computed
})()

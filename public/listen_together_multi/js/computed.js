(function () {
const { LISTEN_STICKERS } = window.LT
const computed = {
          shareUrl() {
            if (!this.roomInfo.roomId) return ''
            const inviterUid =
              this.account.userId || this.roomInfo.creatorId || 0
            return `https://st.music.163.com/listen-together/multishare/index.html?roomId=${encodeURIComponent(this.roomInfo.roomId)}&inviterUid=${encodeURIComponent(inviterUid)}`
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

          canAddSong() {
            return (
              !!this.roomInfo.permission.addSong &&
              this.nextAddSongDuration <= 0
            )
          },
        }

window.LT.computed = computed
})()

(function () {
function mounted() {
          this.viewportWidth = Number(window.innerWidth) || 1024
          this.viewportHeight = Number(window.innerHeight) || 768
          this.logEntries = (window.LT.logs || []).slice(-300)
          window.addEventListener('lt-log', this.onLogEvent)
          window.addEventListener('resize', this.onChatResize)
          window.addEventListener('pointerdown', (event) => {
            if (
              this.chatOpen &&
              event.target instanceof Element &&
              !event.target.closest('.chat-dialog') &&
              !event.target.closest('.chat-fab') &&
              !event.target.closest('.topbar-chat')
            )
              this.closeChat()
          })
          window.addEventListener('keydown', (event) => {
            if (event.key !== 'Escape') return
            if (this.songOpen) this.closeSongDialog()
            else if (this.chatOpen) this.closeChat()
          })
          this.$watch('message', (value) => this.pushLog('status', value))
          this.$watch('roomInfo.chatRoomId', (id) => {
            if (id && this.roomInfo.roomId) this.autoConnectIm()
          })
          this.pushLog('app', '控制台已加载')
          this.init()
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
            ;['timeupdate', 'play', 'pause', 'loadedmetadata', 'volumechange'].forEach(
              (event) => audio.addEventListener(event, syncAudio),
            )
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
            syncAudio()
          }

          const unlockAudio = () => {
            const player = document.getElementById('player')
            if (
              player &&
              player.paused &&
              this.playingInfo.songId &&
              this.playingInfo.audioSrc
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
          document.body.addEventListener('touchstart', unlockAudio)
        }

window.LT.mounted = mounted
})()

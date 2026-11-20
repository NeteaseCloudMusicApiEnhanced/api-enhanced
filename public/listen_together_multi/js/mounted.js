export function mounted() {
          this.init()
          const audio = document.getElementById('player')
          if (audio) {
            audio.onerror = () => {
              if (audio.src) log('Audio', '加载失败', audio.src)
            }

            audio.onended = () => {
              if (this.roomInfo.roomId) {
                log('Audio', '播放结束，立即触发心跳同步下一首')
                this.lastHeartbeatTime = Date.now()
                this.heartbeat().catch(() => {})
              }
            }
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

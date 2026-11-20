(function () {
const { api, log, safeStorage, HEARTBEAT_INTERVAL, STATUS_INTERVAL, MATCH_POLL_INTERVAL, CHAT_INTERVAL, TICK_INTERVAL, REQ_TIMEOUT, CHAT_PAGE_SIZE, AUDIO_LEVELS, DEFAULT_AUDIO_LEVEL, LISTEN_STICKERS, loadSavedStickers } = window.LT
const stickersMethods = {
  isLocalSticker(item) {
              const emoji = this.normalizeSticker(item)
              return !!(
                emoji &&
                this.savedStickers.some(
                  (saved) => saved.emojiImgUrl === emoji.emojiImgUrl,
                )
              )
            },

  async ensureCloudStickers(force = false, append = false) {
              if (this.cloudLoading) return
              if (!this.account.login) {
                this.cloudError = '请先登录网易云账号'
                return
              }
              if (!force && !append && this.cloudLoaded) return
              this.cloudLoading = true
              if (!append) this.cloudError = ''
              try {
                if (!this.cloudGroups.length || force) {
                  const groupRes = await api({
                    url: '/social/emoji/groups',
                    method: 'get',
                    params: { resourceType: 3 },
                  })
                  const groups = (groupRes.data?.data?.emojiGroups || [])
                    .filter((group) => group && group.edit === true)
                    .map((group) => ({
                      id: String(group.id),
                      name: group.name || '自定义表情',
                    }))
                  this.cloudGroups = groups
                  if (!groups.some((group) => group.id === this.cloudGroupId))
                    this.cloudGroupId = groups[0]?.id || ''
                }
                if (!this.cloudGroupId) {
                  this.cloudStickers = []
                  this.cloudMore = false
                  this.cloudLoaded = true
                  return
                }
                const pageRes = await api({
                  url: '/social/emoji/groups/detail/page',
                  method: 'get',
                  params: {
                    emojiGroupId: this.cloudGroupId,
                    cursor: append ? this.cloudCursor : '',
                    size: 20,
                  },
                })
                const raw = pageRes.data?.data?.emojis || []
                const incoming = raw
                  .map((item) =>
                    this.normalizeSticker({
                      ...item,
                      emojiGroupId: item.emojiGroupId ?? this.cloudGroupId,
                    }),
                  )
                  .filter(Boolean)
                if (append) {
                  const seen = new Set(
                    this.cloudStickers.map((item) => item.emojiImgUrl),
                  )
                  this.cloudStickers = [
                    ...this.cloudStickers,
                    ...incoming.filter((item) => !seen.has(item.emojiImgUrl)),
                  ]
                } else {
                  this.cloudStickers = incoming
                }
                this.cloudCursor = pageRes.data?.data?.page?.cursor || ''
                this.cloudMore = pageRes.data?.data?.page?.more === true
                this.cloudLoaded = true
              } catch (e) {
                this.cloudError =
                  e.response?.data?.message || e.message || '读取自定义表情失败'
              } finally {
                this.cloudLoading = false
              }
            },

  async openMyStickers() {
              this.emojiTab = 'saved'
              await this.ensureCloudStickers()
            },

  async refreshCloudStickers() {
              this.cloudLoaded = false
              this.cloudCursor = ''
              await this.ensureCloudStickers(true)
            },

  async loadMoreCloud() {
              if (!this.cloudMore || this.cloudLoading) return
              await this.ensureCloudStickers(false, true)
            },

  normalizeSticker(item) {
              const url = String(item?.emojiImgUrl || item?.url || '')
              if (!/^https?:\/\//.test(url)) return null
              const format =
                item?.format ||
                (url.match(/\.([a-z0-9]+)(?:\?|$)/i) || [])[1] ||
                'png'
              return {
                emojiId: String(item?.emojiId ?? 0),
                emojiGroupId: String(item?.emojiGroupId ?? 0),
                emojiName: String(item?.emojiName || item?.name || '表情').slice(
                  0,
                  80,
                ),
                emojiImgUrl: url,
                width: Math.min(4096, Math.max(1, Number(item?.width) || 160)),
                height: Math.min(4096, Math.max(1, Number(item?.height) || 160)),
                format: String(format).slice(0, 16),
              }
            },

  isStickerSaved(item) {
              const emoji = this.normalizeSticker(item)
              return !!(
                emoji &&
                [...this.cloudStickers, ...this.savedStickers].some(
                  (saved) => saved.emojiImgUrl === emoji.emojiImgUrl,
                )
              )
            },

  persistStickers() {
              safeStorage.set(
                'saved_stickers',
                JSON.stringify(this.savedStickers.slice(0, 60)),
              )
            },

  async saveSticker(item) {
              const emoji = this.normalizeSticker(item)
              if (!emoji) return (this.message = '表情信息无效，无法保存')
              if (this.emojiSaving) return
              this.emojiSaving = true
              try {
                if (!this.isStickerSaved(emoji)) {
                  this.savedStickers = [emoji, ...this.savedStickers].slice(0, 60)
                  this.persistStickers()
                }
                let cloudError = ''
                let cloudSaved = false
                if (
                  Number(emoji.emojiId) > 0 &&
                  emoji.emojiGroupId !== '3001'
                ) {
                  try {
                    const res = await api({
                      url: '/social/emoji/collect',
                      method: 'post',
                      data: {
                        emojiId: emoji.emojiId,
                        emojiGroupId: emoji.emojiGroupId,
                        cookie: this.getFakeAndroidCookie(),
                      },
                    })
                    cloudSaved = res.data.code === 200
                    if (!cloudSaved)
                      cloudError = res.data.message || '云端保存失败'
                  } catch (e) {
                    cloudError =
                      e.response?.data?.message || e.message || '云端保存失败'
                  }
                }
                this.message = cloudSaved
                  ? '表情已保存到网易云自定义表情'
                  : cloudError
                    ? '已保存到本地；' + cloudError
                    : '表情已保存到本地'
                if (cloudSaved) {
                  this.cloudLoaded = false
                  this.ensureCloudStickers(true).catch(() => {})
                }
              } finally {
                this.emojiSaving = false
              }
            },

  removeSavedSticker(item) {
              const emoji = this.normalizeSticker(item)
              if (!emoji) return
              this.savedStickers = this.savedStickers.filter(
                (saved) => saved.emojiImgUrl !== emoji.emojiImgUrl,
              )
              this.persistStickers()
              this.message = '已从本地表情移除'
            },

  addStickerUrl() {
              const url = this.emojiUrlInput.trim()
              if (!/^https?:\/\//.test(url))
                return (this.message = '请输入 http(s) 图片地址')
              const emoji = this.normalizeSticker({
                emojiImgUrl: url,
                emojiName: '自定义表情',
                width: 160,
                height: 160,
              })
              if (!emoji) return (this.message = '图片地址无效')
              if (!this.isStickerSaved(emoji)) {
                this.savedStickers = [emoji, ...this.savedStickers].slice(0, 60)
                this.persistStickers()
              }
              this.emojiUrlInput = ''
              this.emojiTab = 'saved'
              this.message = '表情已保存到本地'
            },

  async sendSticker(item) {
              const emoji = this.normalizeSticker(item)
              if (!emoji || !this.roomInfo.chatRoomId || this.chatSending)
                return
              this.chatSending = true
              try {
                const res = await api({
                  url: '/listentogether/multi/chat/send',
                  method: 'post',
                  data: {
                    roomId: this.roomInfo.roomId,
                    chatRoomId: this.roomInfo.chatRoomId,
                    text: `[${emoji.emojiName}]`,
                    emoji,
                    cookie: this.getFakeAndroidCookie(),
                  },
                })
                if (res.data.code === 200) {
                  this.emojiPickerOpen = false
                  await this.fetchChat()
                  this.message = '表情已发送'
                } else {
                  this.message =
                    '表情发送失败: ' + (res.data.message || '未知错误')
                }
              } catch (e) {
                this.message =
                  '表情发送异常: ' +
                  (e.response?.data?.message || e.message || '未知错误')
              } finally {
                this.chatSending = false
              }
            },

}

window.LT.stickersMethods = stickersMethods
})()

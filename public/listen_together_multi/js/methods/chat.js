/**
 * 房间聊天：历史分页、未读、草稿、@提及、表情插入
 */
;(function () {
  'use strict'

  const { api, log, util, CHAT_PAGE_SIZE, CHAT_MAX_LENGTH, safeStorage } =
    window.LT

  const chatMethods = {
    chatBaseUrl() {
      return this.roomInfo.specialOperate
        ? '/listentogether/multi/special/msg/history'
        : '/listentogether/multi/match/msg/history'
    },

    /** 请求返回时房间/轮询代际是否仍是发起时的那一个 */
    chatRequestCurrent(roomId, generation) {
      return (
        !!roomId &&
        String(roomId) === String(this.roomInfo.roomId) &&
        generation === this.pollGeneration
      )
    },

    /* ---------------- 拉取 ---------------- */

    async fetchChatAllPages(maxPages = 3) {
      if (!this.roomInfo.roomId) return
      await this.fetchChat()
      for (let page = 1; page < maxPages && this.chatMore; page++) {
        await this.loadMoreChat({ silent: true })
      }
    },

    async fetchChat() {
      const roomId = this.roomInfo.roomId
      if (!roomId) return
      const generation = this.pollGeneration
      try {
        const qs = new URLSearchParams({ size: String(CHAT_PAGE_SIZE) })
        const res = await api({
          url: `${this.chatBaseUrl()}?${qs.toString()}`,
          method: 'post',
          data: {
            roomId,
            direction: 0,
            cookie: this.getFakeAndroidCookie(),
          },
        })
        // 退出 / 重新匹配 / 换房后，旧房间的历史不能写进新房间
        if (!this.chatRequestCurrent(roomId, generation)) return
        const data = res.data?.data
        if (res.data.code !== 200 || !Array.isArray(data?.records)) return

        this.updateUpCntFromRecords(data.records)
        const incoming = this.filterChatRecords(data.records)

        if (!this.chatCursorLoaded) {
          this.chatCursor = data.page?.cursor || ''
          this.chatMore = data.page?.more === true
          this.chatCursorLoaded = true
        }

        const previous = this.chatHistory
        const previousLastId = previous.length
          ? String(previous[previous.length - 1].id)
          : ''
        const merged = this.mergeChatMessages(previous, incoming)
        const newLastId = merged.length
          ? String(merged[merged.length - 1].id)
          : ''

        if (previous.length && newLastId && newLastId !== previousLastId) {
          const nearBottom =
            this.chatOpen &&
            this.chatTab === 'chat' &&
            (this.chatAtBottom || this.pane !== 'chat' || this.isWideViewport())
          if (!nearBottom) {
            const previousIndex = merged.findIndex(
              (msg) => String(msg.id) === previousLastId,
            )
            const freshMessages =
              previousIndex >= 0
                ? merged.slice(previousIndex + 1)
                : merged.slice(-1)
            const unread = freshMessages.filter(
              (msg) => !msg.isSystem && !this.isMeUid(msg.sendUid),
            )
            if (unread.length) {
              this.chatUnread = Math.min(999, this.chatUnread + unread.length)
              if (!this.chatUnreadAnchor) {
                const anchor = unread[0]
                this.chatUnreadAnchor = anchor ? String(anchor.id) : ''
              }
            }
          }
        }

        this.chatHistory = merged
        if (this.chatOpen && this.chatAtBottom) this.scrollChat(true)
      } catch (e) {
        log('error', 'Chat', '请求异常', e?.message || e)
      }
    },

    async loadMoreChat(options = {}) {
      const roomId = this.roomInfo.roomId
      if (!roomId || this.chatLoadingMore) return
      if (!this.chatMore || !this.chatCursor) return
      const generation = this.pollGeneration
      this.chatLoadingMore = true
      const box = document.getElementById('chatList')
      const previousHeight = box ? box.scrollHeight : 0
      const previousTop = box ? box.scrollTop : 0
      try {
        const qs = new URLSearchParams({
          size: String(CHAT_PAGE_SIZE),
          cursor: this.chatCursor,
        })
        const res = await api({
          url: `${this.chatBaseUrl()}?${qs.toString()}`,
          method: 'post',
          data: {
            roomId,
            direction: 0,
            cookie: this.getFakeAndroidCookie(),
          },
        })
        if (!this.chatRequestCurrent(roomId, generation)) return
        const data = res.data?.data
        if (res.data.code !== 200 || !Array.isArray(data?.records)) return
        this.updateUpCntFromRecords(data.records)
        const older = this.filterChatRecords(data.records)
        this.chatCursor = data.page?.cursor || ''
        this.chatMore = data.page?.more === true
        this.chatHistory = this.mergeChatMessages(older, this.chatHistory)

        if (!options.silent) {
          this.$nextTick(() => {
            const el = document.getElementById('chatList')
            if (!el) return
            el.scrollTop = previousTop + (el.scrollHeight - previousHeight)
          })
        }
      } catch (e) {
        log('error', 'Chat', '加载更早消息失败', e?.message || e)
      } finally {
        this.chatLoadingMore = false
      }
    },

    filterChatRecords(records) {
      const myUid = String(this.account.userId || '')
      return records
        .filter((item) => {
          const only = item.onlyCanSeeUserIds
          if (Array.isArray(only) && only.length > 0) {
            return only.map(String).includes(myUid)
          }
          return true
        })
        .map((item, index) => this.mapChatRecord(item, index))
        .filter((msg) => !!(msg.text || msg.emojiUrl || msg.cover))
    },

    isDuplicateMessage(a, b) {
      if (!a || !b) return false
      if (String(a.id) === String(b.id)) return true
      const textA = String(a.text || '').trim()
      const textB = String(b.text || '').trim()
      if (!textA || !textB) return false
      if (textA !== textB) return false
      if (!!a.isSystem !== !!b.isSystem) return false
      const delta = Math.abs(
        (Number(a.sendTime) || 0) - (Number(b.sendTime) || 0),
      )
      if (delta > 4000) return false
      // 系统 / 互动消息没有稳定的 msgId，只能按「文本 + 时间窗」去重
      if (a.isSystem && b.isSystem) return true
      // 普通消息：只在 IM 与历史回填这两个来源之间做内容去重，
      // 同一来源里连续发两条相同内容必须都保留。
      return !!(
        a.source &&
        b.source &&
        a.source !== b.source &&
        String(a.sendUid || '') === String(b.sendUid || '')
      )
    },

    mergeChatMessages(older, newer) {
      const list = []
      for (const message of [...(older || []), ...(newer || [])]) {
        if (
          list.some((existing) => this.isDuplicateMessage(existing, message))
        ) {
          continue
        }
        list.push(message)
      }
      return list.sort((a, b) => {
        const ta = Number(a.sendTime) || 0
        const tb = Number(b.sendTime) || 0
        if (ta !== tb) return ta - tb
        return String(a.id).localeCompare(String(b.id))
      })
    },

    mapChatRecord(item, index) {
      const body = item.imChatRoomMsgBody || {}
      const rich = body.msgRichText
      let emoji = item.emoji || item.clientExt?.emoji || null
      if (typeof emoji === 'string') {
        try {
          emoji = JSON.parse(emoji)
        } catch (e) {
          emoji = null
        }
      }
      const serverExt = item.serverExt || {}
      // 互动 / 系统消息没有 msgId，服务端还会下发 serverSeq，用它才能让
      // IM 推送与历史回填生成同一个 id
      const stableId = String(
        serverExt.msgId ||
          serverExt.serverSeq ||
          item.sendTime ||
          `idx-${index}`,
      )

      const sendUid = item.sendUid ?? serverExt.userId ?? null
      const nickname = item.nickname || serverExt.nickname || ''
      const avatarUrl = item.avatarUrl || serverExt.avatarUrl || ''
      const isInteraction = Number(item.msgType) === 1
      const isSystem = !sendUid || isInteraction

      const isEmoji = item.msgType === 0 && emoji
      const emojiUrl = isEmoji ? emoji.emojiAnimUrl || emoji.emojiImgUrl : ''

      let suggestSongId = null
      if (rich?.contentTextList) {
        for (const part of rich.contentTextList) {
          if (part.highLighted && part.orpheus) {
            const match = part.orpheus.match(/addSong\?songId=(\d+)/)
            if (match) {
              suggestSongId = Number(match[1])
              break
            }
          }
        }
      }

      const resource = item.resourceInfo
      return {
        id: stableId,
        sendUid: isInteraction ? null : sendUid,
        nickname: isInteraction
          ? '房间互动'
          : isSystem
            ? nickname || '系统'
            : nickname || '听友',
        avatarUrl: isInteraction ? '' : avatarUrl,
        isSystem,
        emojiUrl,
        emoji: isEmoji ? emoji : null,
        text: body.mainStateText || body.text || '',
        cover: resource?.coverUrl || '',
        songName: resource?.title || '',
        artistName: Array.isArray(resource?.artistName)
          ? resource.artistName.join('/')
          : resource?.artistName || '',
        resourceInfo: resource || null,
        suggestSongId,
        sendTime: Number(item.sendTime) || 0,
        source: item.source || 'history',
      }
    },

    /** IM 推送的单条消息直接并入列表，避免再拉一次 HTTP 历史 */
    appendChatMessage(message) {
      if (!message || !message.id) return false
      const id = String(message.id)
      if (
        this.chatHistory.some((item) => this.isDuplicateMessage(item, message))
      ) {
        return false
      }
      const visible =
        this.chatOpen &&
        this.chatTab === 'chat' &&
        (this.chatAtBottom || this.pane !== 'chat' || this.isWideViewport())
      this.chatHistory = this.mergeChatMessages(this.chatHistory, [message])
      if (!visible && !message.isSystem && !this.isMeUid(message.sendUid)) {
        this.chatUnread = Math.min(999, this.chatUnread + 1)
        if (!this.chatUnreadAnchor) this.chatUnreadAnchor = id
      }
      if (this.chatOpen && this.chatAtBottom) this.scrollChat(true)
      return true
    },

    /* ---------------- 发送 ---------------- */

    async sendChat(text) {
      if (this.chatSending) return
      const content = String(text == null ? this.chatInput : text)
        .replace(/\r/g, '')
        .trim()
      if (!content) return
      if (!this.roomInfo.chatRoomId) {
        this.toast('房间还没有聊天室，暂不能发送', 'warn')
        return
      }
      const limited = Array.from(content).slice(0, CHAT_MAX_LENGTH).join('')
      this.chatSending = true
      try {
        const res = await api({
          url: '/listentogether/multi/chat/send',
          method: 'post',
          data: {
            roomId: this.roomInfo.roomId,
            chatRoomId: this.roomInfo.chatRoomId,
            text: limited,
            cookie: this.getFakeAndroidCookie(),
          },
        })
        if (res.data.code === 200) {
          if (this.chatInput.trim() === content) this.setChatInput('')
          this.chatAtBottom = true
          await this.fetchChat()
        } else {
          this.toast('发送失败：' + (res.data.message || '未知错误'), 'error')
        }
      } catch (e) {
        this.toast(
          '发送异常：' + (e.response?.data?.message || e.message || '未知错误'),
          'error',
        )
      } finally {
        this.chatSending = false
      }
    },

    /* ---------------- 输入 / 草稿 ---------------- */

    chatDraftKey() {
      return this.roomInfo.roomId ? `room:${this.roomInfo.roomId}` : 'room:none'
    },

    restoreChatDraft() {
      const draft = this.chatDrafts[this.chatDraftKey()] || ''
      this.chatInput = draft
      this.$nextTick(() => this.resizeChatInput())
    },

    saveChatDraft() {
      const key = this.chatDraftKey()
      if (!this.roomInfo.roomId) return
      if (this.chatInput) this.chatDrafts[key] = this.chatInput
      else delete this.chatDrafts[key]
      safeStorage.set('lt_chat_drafts', JSON.stringify(this.chatDrafts))
    },

    setChatInput(value) {
      this.chatInput = value
      this.saveChatDraft()
      this.$nextTick(() => {
        this.resizeChatInput()
        this.updateMentionQuery()
      })
    },

    resizeChatInput() {
      const el = this.$refs.chatInput
      if (!el) return
      el.style.height = 'auto'
      el.style.height = `${Math.min(120, el.scrollHeight)}px`
    },

    onChatInputChange() {
      this.saveChatDraft()
      this.resizeChatInput()
      this.updateMentionQuery()
    },

    onChatKeydown(event) {
      if (event.isComposing || event.keyCode === 229) return
      if (this.mentionOpen && this.mentionCandidates.length) {
        if (event.key === 'ArrowDown') {
          event.preventDefault()
          this.mentionIndex =
            (this.mentionIndex + 1) % this.mentionCandidates.length
          return
        }
        if (event.key === 'ArrowUp') {
          event.preventDefault()
          this.mentionIndex =
            (this.mentionIndex - 1 + this.mentionCandidates.length) %
            this.mentionCandidates.length
          return
        }
        if (event.key === 'Escape') {
          event.preventDefault()
          this.mentionOpen = false
          return
        }
        if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey) {
          event.preventDefault()
          const target = this.mentionCandidates[this.mentionIndex]
          if (target) this.applyMention(target)
          return
        }
      }
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault()
        this.sendChat()
        return
      }
      if (event.key === 'Escape' && this.emojiPickerOpen) {
        this.emojiPickerOpen = false
      }
    },

    insertEmojiText(text) {
      const el = this.$refs.chatInput
      const value = this.chatInput
      if (el && typeof el.selectionStart === 'number') {
        const start = el.selectionStart
        const end = el.selectionEnd
        const next = `${value.slice(0, start)}${text}${value.slice(end)}`
        this.setChatInput(Array.from(next).slice(0, CHAT_MAX_LENGTH).join(''))
        this.$nextTick(() => {
          const pos = start + text.length
          el.focus()
          el.setSelectionRange(pos, pos)
        })
      } else {
        this.setChatInput(`${value}${text}`.slice(0, CHAT_MAX_LENGTH))
      }
    },

    /* ---------------- @ 提及 ---------------- */

    openMentions(prefix = '@') {
      if (this.mentionOpen) {
        this.mentionOpen = false
        return
      }
      this.insertEmojiText(prefix)
      this.updateMentionQuery()
    },

    updateMentionQuery() {
      const el = this.$refs.chatInput
      const value = this.chatInput
      const caret =
        el && typeof el.selectionStart === 'number'
          ? el.selectionStart
          : value.length
      const before = value.slice(0, caret)
      const match = before.match(/@([^\s@]{0,24})$/)
      if (!match) {
        this.mentionOpen = false
        this.mentionQuery = ''
        return
      }
      this.mentionOpen = true
      this.mentionQuery = match[1] || ''
      this.mentionIndex = 0
    },

    applyMention(user) {
      const name = String(user?.nickname || '').trim()
      const el = this.$refs.chatInput
      if (!name) return
      const value = this.chatInput
      const caret =
        el && typeof el.selectionStart === 'number'
          ? el.selectionStart
          : value.length
      const before = value.slice(0, caret)
      const after = value.slice(caret)
      const replaced = before.replace(/@([^\s@]{0,24})$/, `@${name} `)
      const next = `${replaced}${after}`
      this.setChatInput(Array.from(next).slice(0, CHAT_MAX_LENGTH).join(''))
      this.mentionOpen = false
      this.$nextTick(() => {
        el?.focus()
        const pos = Math.min(replaced.length, this.chatInput.length)
        el?.setSelectionRange(pos, pos)
      })
    },

    /* ---------------- 滚动 ---------------- */

    jumpChatToBottom() {
      this.chatAtBottom = true
      this.chatUnread = 0
      this.chatUnreadAnchor = ''
      this.scrollChat(true)
    },

    onChatImageLoad() {
      if (this.chatAtBottom) this.scrollChat(true)
    },

    onChatScroll(event) {
      const el = event.target
      if (!el) return
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight
      this.chatAtBottom = distance < 64
      if (this.chatAtBottom && this.chatUnread) {
        this.chatUnread = 0
        this.chatUnreadAnchor = ''
      }
      if (el.scrollTop < 48 && this.chatMore && !this.chatLoadingMore) {
        this.loadMoreChat()
      }
    },

    /* ---------------- 日期与分组 ---------------- */

    showDayDivider(index) {
      const list = this.chatHistory
      if (index < 0 || index >= list.length) return false
      if (index === 0) return true
      return (
        util.dayLabel(list[index].sendTime) !==
        util.dayLabel(list[index - 1].sendTime)
      )
    },

    showMsgName(index) {
      const list = this.chatHistory
      const current = list[index]
      if (!current || current.isSystem) return false
      if (index === 0) return true
      const previous = list[index - 1]
      if (!previous || previous.isSystem) return true
      if (String(previous.sendUid) !== String(current.sendUid)) return true
      const gap =
        (Number(current.sendTime) || 0) - (Number(previous.sendTime) || 0)
      if (gap > 5 * 60 * 1000) return true
      return this.showDayDivider(index)
    },
  }

  window.LT.chatMethods = chatMethods
})()

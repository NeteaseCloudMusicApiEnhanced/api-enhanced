/**
 * 聊天视图：消息流、输入区、表情面板
 */
;(function () {
  'use strict'

  window.LT.components = Object.assign(window.LT.components || {}, {
    'lt-chat': {
      template: '#tpl-chat',
      mounted() {
        this.restoreChatDraft()
        this.chatAtBottom = true
        this.scrollChat(true)
        // 贴纸 / 封面是异步加载的，加载完成后补一次贴底
        setTimeout(() => this.scrollChat(true), 150)
        setTimeout(() => this.scrollChat(true), 600)
      },
      beforeUnmount() {
        this.saveChatDraft()
        if (this.mentionOpen) this.mentionOpen = false
      },
      watch: {
        'chatHistory.length'() {
          if (!this.chatOpen) return
          if (this.chatAtBottom) this.scrollChat(true)
        },
        'roomInfo.chatRoomId'(id) {
          if (id) this.restoreChatDraft()
        },
      },
    },

    'lt-emoji': {
      template: '#tpl-emoji',
      mounted() {
        if (this.emojiTab === 'pack') this.ensureCloudStickers().catch(() => {})
      },
    },
  })
})()

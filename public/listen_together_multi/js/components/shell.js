/**
 * 外壳视图：登录、大厅、顶栏、成员、Toast
 *
 * 组件不持有独立状态：data/computed/methods 由 app.js 注入同一份 store，
 * 因此所有视图读写的是同一个响应式对象。
 */
;(function () {
  'use strict'

  window.LT.components = Object.assign(window.LT.components || {}, {
    'lt-login': {
      template: '#tpl-login',
      mounted() {
        this.ensureLoginThenQr()
      },
      watch: {
        'account.login'(login) {
          if (login) this.stopQrLogin('success', '已登录，正在进入…')
        },
      },
      beforeUnmount() {
        this.stopQrLogin()
      },
    },

    'lt-lobby': {
      template: '#tpl-lobby',
      mounted() {
        // 进入大厅时刷新一次房间状态，避免恢复提示过期
        if (this.account.login) this.resumeIfInRoom().catch(() => {})
      },
    },

    'lt-topbar': {
      template: '#tpl-topbar',
      mounted() {
        this._closeMenu = (event) => {
          if (!this.leaveMenuOpen) return
          const target = event.target
          if (target instanceof Element && target.closest('.lt-topbar__menu'))
            return
          if (target instanceof Element && target.closest('.lt-topbar')) return
          this.leaveMenuOpen = false
        }
        window.addEventListener('pointerdown', this._closeMenu)
      },
      beforeUnmount() {
        if (this._closeMenu)
          window.removeEventListener('pointerdown', this._closeMenu)
      },
    },

    'lt-members': {
      template: '#tpl-members',
      props: { flat: { type: Boolean, default: false } },
    },

    'lt-members-drawer': {
      template: '#tpl-members-drawer',
    },

    'lt-toasts': {
      template: '#tpl-toasts',
    },
  })
})()

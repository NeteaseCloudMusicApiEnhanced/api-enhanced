/**
 * 邀请：站内邀请面板 + 分享链接落地预览
 */
;(function () {
  'use strict'

  const { api, log, util } = window.LT

  function roomTypeLabelOf(dto = {}) {
    if (dto.specialOperate) return '特殊房'
    const type = String(dto.roomType || '').toUpperCase()
    if (type === 'MULTI_MATCH_SONG') return '公开匹配房'
    if (type === 'FOLLOW_LISTEN') return '关注一起听'
    if (Number(dto.roomBizType) === 1) return '私密好友房'
    if (Number(dto.roomBizType) === 2) return '公开好友房'
    return '一起听房间'
  }

  const inviteMethods = {
    /* ---------------- 落地预览 ---------------- */

    readInviteFromUrl() {
      try {
        const params = new URLSearchParams(location.search)
        let roomId = params.get('roomId') || ''
        let inviterUid =
          params.get('inviterUid') || params.get('inviterId') || ''
        if (!roomId && location.hash) {
          const hash = new URLSearchParams(location.hash.replace(/^#/, ''))
          roomId = hash.get('roomId') || ''
          inviterUid = inviterUid || hash.get('inviterUid') || ''
        }
        if (!roomId) return null
        return { roomId: String(roomId), inviterUid: String(inviterUid || 0) }
      } catch (e) {
        return null
      }
    },

    maybeShowPendingInvite() {
      if (!this.account.login) return
      const invite = this._pendingInvite
      if (!invite) return
      if (this.roomInfo.roomId) {
        this.toast('你已经在一个房间里了', 'warn')
        this._pendingInvite = null
        return
      }
      if (this.landingLoading) return
      this.loadLandingInfo(invite)
    },

    async loadLandingInfo(invite) {
      this.landingLoading = true
      try {
        const res = await api({
          url: '/listentogether/multi/landing/info',
          method: 'post',
          data: {
            roomId: invite.roomId,
            inviterUid: invite.inviterUid || 0,
            cookie: this.getFakeAndroidCookie(),
          },
        })
        log('info', 'Invite', '预览返回', res.data?.data)
        const info = this.normalizeLanding(res.data?.data || {}, invite)
        this.landingInfo = info
      } catch (e) {
        log('error', 'Invite', '预览失败', e?.message || e)
        // 预览失败也允许直接尝试加入
        this.landingInfo = {
          roomId: invite.roomId,
          inviterUid: invite.inviterUid || 0,
          inviterName: '好友',
          inviterAvatar: '',
          roomTypeLabel: '一起听房间',
          roomStatus: '',
          songName: '',
          songArtist: '',
          songCover: '',
          members: 0,
          memberList: [],
          degraded: true,
        }
        this.toast('邀请预览失败，仍可尝试加入', 'warn')
      } finally {
        this.landingLoading = false
      }
    },

    normalizeLanding(data, invite) {
      const snapshot =
        data.multiLtRoomSnapshot || data.snapshot || data.roomSnapshot || null
      const dto =
        snapshot?.multiRoomInfoDTO ||
        data.multiRoomInfoDTO ||
        data.roomInfo ||
        {}
      const agg = snapshot?.multiLtRoomUserAgg || data.multiLtRoomUserAgg || {}
      const inviter =
        data.inviter ||
        data.inviterUserInfo ||
        data.inviterInfo ||
        data.userInfo ||
        data.inviteUser ||
        {}
      const playSong =
        snapshot?.roomPlaySongInfo?.playSong ||
        data.roomPlaySongInfo?.playSong ||
        data.playSong ||
        {}
      // 官方落地页返回的是扁平的 songData / roomStatus，不是 playSong
      const songData = data.songData || {}
      const songArtists = Array.isArray(songData.artists)
        ? songData.artists
            .map((artist) =>
              typeof artist === 'string' ? artist : artist?.name || '',
            )
            .filter(Boolean)
            .join(' / ')
        : ''
      const userList = []
      const pushUser = (user) => {
        if (!user) return
        const uid = util.uidOf(user)
        if (!uid) return
        if (userList.some((item) => String(util.uidOf(item)) === String(uid)))
          return
        userList.push(user)
      }
      if (data.inviter) pushUser(data.inviter)
      if (Array.isArray(data.others)) data.others.forEach(pushUser)
      if (Array.isArray(agg.onlineUserInfos))
        agg.onlineUserInfos.forEach(pushUser)
      if (Array.isArray(data.onlineUserInfos))
        data.onlineUserInfos.forEach(pushUser)
      if (Array.isArray(data.members)) data.members.forEach(pushUser)
      const urlInviterUid = String(invite.inviterUid || '')
      return {
        roomId: dto.roomId || data.roomId || invite.roomId,
        inviterUid:
          (urlInviterUid && urlInviterUid !== '0' ? urlInviterUid : '') ||
          util.uidOf(inviter) ||
          dto.firstUserId ||
          0,
        inviterName:
          inviter.nickname || data.inviterNickname || data.nickname || '好友',
        inviterAvatar:
          inviter.avatarUrl || inviter.avatar || data.inviterAvatar || '',
        roomTypeLabel: roomTypeLabelOf({
          ...dto,
          ...(data.roomType ? { roomType: data.roomType } : {}),
          ...(data.roomBizType !== undefined
            ? { roomBizType: data.roomBizType }
            : {}),
          specialOperate: !!data.specialOperate,
        }),
        roomStatus: String(data.roomStatus || ''),
        songName:
          songData.name ||
          songData.songName ||
          playSong.songName ||
          playSong.name ||
          data.songName ||
          '',
        songArtist:
          songArtists ||
          (Array.isArray(playSong.artistName)
            ? playSong.artistName.join(' / ')
            : playSong.artistName || playSong.artist || ''),
        songCover:
          songData.album?.picUrl ||
          songData.coverUrl ||
          playSong.coverUrl ||
          playSong.cover ||
          '',
        members: Number(
          dto.userCount || data.userCount || userList.length || 0,
        ),
        memberList: userList.map((user) => ({
          uid: String(util.uidOf(user) || ''),
          nickname: user.nickname || '听友',
          avatar: user.avatarUrl || user.avatar || '',
        })),
        degraded: false,
      }
    },

    async joinLandingRoom() {
      if (!this.landingInfo) return
      const info = this.landingInfo
      if (info.roomStatus && info.roomStatus !== 'AVAILABLE') {
        this.toast('房间已结束或不可加入，请让好友重新创建', 'warn')
        return
      }
      this.landingInfo = null
      this._pendingInvite = null
      this.shareLinkInput = ''
      this.joinForm.roomId = String(info.roomId || '')
      this.joinForm.inviterId = String(info.inviterUid || 0)
      await this.joinRoom()
    },

    dismissLanding() {
      this.landingInfo = null
      this._pendingInvite = null
    },

    /* ---------------- 站内邀请 ---------------- */

    async loadInvitePanel() {
      if (!this.roomInfo.roomId) return
      this.inviteLoading = true
      this.inviteError = ''
      this.inviteUsers = []
      this.inviteGroups = []
      this.inviteSelected = []
      this.inviteGroupsSelected = []
      try {
        const res = await api({
          url: '/listentogether/mutual/follows/get/v2',
          method: 'post',
          data: {
            roomId: this.roomInfo.roomId,
            songId: this.playingInfo.songId || '',
            cookie: this.getFakeAndroidCookie(),
          },
        })
        log('info', 'Invite', '候选返回', res.data?.data)
        const data = res.data?.data || {}
        const users = this.collectInviteUsers(data)
        const groups = this.collectInviteGroups(data)
        this.inviteUsers = users
        this.inviteGroups = groups
      } catch (e) {
        log('error', 'Invite', '候选读取失败', e?.message || e)
        this.inviteError =
          '邀请候选读取失败：' +
          (e.response?.data?.message || e.message || '未知错误')
      } finally {
        this.inviteLoading = false
      }
    },

    collectInviteUsers(data) {
      // 官方响应：mutualFollowLists[{ userInfo, online, inRoom, description, recommendReasons }]
      const sources = [
        data.mutualFollowLists,
        data.mutualFollows,
        data.follows,
        data.users,
        data.userList,
        data.friendList,
        data.recommendUsers,
        data.rcmdUsers,
        data.aiRobots,
      ]
      const seen = new Set()
      const result = []
      for (const list of sources) {
        if (!Array.isArray(list)) continue
        for (const entry of list) {
          if (!entry) continue
          const user = entry.userInfo || entry.user || entry
          const uid = util.uidOf(user) || util.uidOf(entry)
          if (uid === '' || seen.has(String(uid))) continue
          seen.add(String(uid))
          const online =
            entry.online === true ||
            user.online === true ||
            entry.onlineStatus === 1 ||
            user.onlineStatus === 1 ||
            user.status === 'online'
          const inRoom = !!(entry.inRoom || user.inRoom || entry.inMultiRoom)
          const reasons = Array.isArray(entry.recommendReasons)
            ? entry.recommendReasons.filter(
                (item) =>
                  typeof item === 'string' &&
                  item !== '在线' &&
                  item !== '离线',
              )
            : []
          result.push({
            uid: String(uid),
            nickname: user.nickname || entry.nickname || `UID ${uid}`,
            avatar: user.avatarUrl || user.avatar || entry.avatar || '',
            online,
            inRoom,
            reason:
              reasons.join(' · ') ||
              (typeof entry.description === 'string' ? entry.description : ''),
          })
        }
      }
      return result.sort((a, b) => Number(b.online) - Number(a.online))
    },

    collectInviteGroups(data) {
      const sources = [
        data.multiGroupLists,
        data.groups,
        data.groupList,
        data.groupInfos,
        data.chatGroups,
      ]
      const seen = new Set()
      const result = []
      for (const list of sources) {
        if (!Array.isArray(list)) continue
        for (const item of list) {
          const group = item.groupInfo || item.group || item.info || item
          const groupId =
            group.groupId || group.id || group.groupID || item.groupId
          if (!groupId || seen.has(String(groupId))) continue
          seen.add(String(groupId))
          result.push({
            groupId: String(groupId),
            name:
              group.name || group.groupName || group.title || `群聊 ${groupId}`,
            memberCount: Number(
              group.groupMemberNum || group.memberCount || group.userCount || 0,
            ),
          })
        }
      }
      return result
    },

    toggleInviteUser(user) {
      if (!user || user.inRoom) return
      const uid = String(user.uid)
      const index = this.inviteSelected.indexOf(uid)
      if (index >= 0) this.inviteSelected.splice(index, 1)
      else this.inviteSelected.push(uid)
    },

    toggleInviteGroup(group) {
      if (!group) return
      const id = String(group.groupId)
      const index = this.inviteGroupsSelected.indexOf(id)
      if (index >= 0) this.inviteGroupsSelected.splice(index, 1)
      else this.inviteGroupsSelected.push(id)
    },

    async sendInvites() {
      if (this.inviteSending) return
      if (!this.inviteSelected.length && !this.inviteGroupsSelected.length)
        return
      this.inviteSending = true
      try {
        const res = await api({
          url: '/listentogether/multi/invite',
          method: 'post',
          data: {
            roomId: this.roomInfo.roomId,
            inviteUids: this.inviteSelected.join(','),
            groupIds: this.inviteGroupsSelected.join(','),
            cookie: this.getFakeAndroidCookie(),
          },
        })
        const out = res.data.data
        const ok =
          res.data.code === 200 && out !== false && out?.result !== false
        if (ok) {
          this.toast('邀请已发送', 'ok')
          this.inviteOpen = false
          this.inviteSelected = []
          this.inviteGroupsSelected = []
        } else {
          this.toast(
            '邀请失败：' +
              (out?.failedMessage ||
                out?.failedMsg ||
                res.data.message ||
                '未知错误'),
            'error',
          )
        }
      } catch (e) {
        this.toast(
          '邀请异常：' + (e.response?.data?.message || e.message || '未知错误'),
          'error',
        )
      } finally {
        this.inviteSending = false
      }
    },

    /** 邀请页也能拿到一小部分成员，进房后补一次，作为 IM / HTTP 之外的兜底 */
    async enrichMembersFromLanding() {
      if (this.mockMode) return
      if (!this.roomInfo.roomId || this._landingMembersTried) return
      this._landingMembersTried = true
      try {
        const res = await api({
          url: '/listentogether/multi/landing/info',
          method: 'post',
          data: {
            roomId: this.roomInfo.roomId,
            inviterUid: this.roomInfo.creatorId || 0,
            cookie: this.getFakeAndroidCookie(),
          },
        })
        const data = res.data?.data || {}
        const list = []
        const push = (user) => {
          if (!user) return
          const uid = util.uidOf(user)
          if (!uid) return
          if (list.some((item) => String(item.uid) === String(uid))) return
          list.push(user)
        }
        push(data.inviter)
        if (Array.isArray(data.others)) data.others.forEach(push)
        const total = Number(data.onlineNums || data.userCount || 0)
        if (total > 0) {
          this.roomInfo.onlineNums = Math.max(
            Number(this.roomInfo.onlineNums) || 0,
            total,
          )
        }
        if (list.length) {
          this._landingMembers = list.map((user) => ({
            uid: util.uidOf(user),
            nickname: util.fixMojibake(user.nickname || '听友'),
            avatar: user.avatar || user.avatarUrl || '',
          }))
          this.recomputeRoomUsers()
        }
      } catch (e) {
        /* 邀请页失败不影响主流程 */
      }
    },

    async sendStartMsg() {
      if (!this.roomInfo.roomId) return
      try {
        await api({
          url: '/listentogether/multi/start/msg',
          method: 'post',
          data: {
            roomId: this.roomInfo.roomId,
            cookie: this.getFakeAndroidCookie(),
          },
        })
        this.toast('已发送开始消息', 'ok')
      } catch (e) {
        this.toast('发送开始消息失败', 'error')
      }
    },
  }

  window.LT.inviteMethods = inviteMethods
})()

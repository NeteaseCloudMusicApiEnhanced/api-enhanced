/**
 * ?mock=1 预览模式
 *
 * 不请求任何接口，直接注入一套完整的房间数据，用于在没有登录态的情况下
 * 开发、验收界面与响应式布局。
 */
;(function () {
  'use strict'

  const palette = [
    ['#f0563a', '#7a1d8f'],
    ['#2b7cff', '#06203f'],
    ['#19c37d', '#0b3a2e'],
    ['#ffb022', '#7d2f0f'],
    ['#a06bff', '#2a1150'],
    ['#ff5f8f', '#4a0f2e'],
    ['#3ad0ff', '#0d2c44'],
    ['#ffd166', '#5a3a06'],
  ]

  function art(index, size = 320) {
    const [from, to] = palette[index % palette.length]
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${from}"/>
          <stop offset="100%" stop-color="${to}"/>
        </linearGradient>
      </defs>
      <rect width="${size}" height="${size}" fill="url(#g)"/>
      <circle cx="${size * 0.68}" cy="${size * 0.3}" r="${size * 0.28}" fill="rgba(255,255,255,0.18)"/>
      <circle cx="${size * 0.3}" cy="${size * 0.74}" r="${size * 0.2}" fill="rgba(255,255,255,0.12)"/>
    </svg>`
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  }

  function avatar(name, index) {
    const [from, to] = palette[(index + 3) % palette.length]
    const initial = String(name || '?')
      .trim()
      .slice(0, 1)
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80">
      <defs><linearGradient id="a" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${from}"/><stop offset="100%" stop-color="${to}"/>
      </linearGradient></defs>
      <rect width="80" height="80" rx="40" fill="url(#a)"/>
      <text x="40" y="52" font-size="34" font-family="-apple-system, sans-serif" font-weight="600"
        fill="rgba(255,255,255,0.92)" text-anchor="middle">${initial}</text>
    </svg>`
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  }

  const users = [
    { nickname: '夜航星', index: 0 },
    { nickname: '柚子汽水', index: 1 },
    { nickname: '午夜电台', index: 2 },
    { nickname: 'Kaze', index: 3 },
  ]

  const queue = [
    ['日落大道', '梁博'],
    ['爱情转移', '陈奕迅'],
    ['City of Stars', 'Ryan Gosling'],
    ['温柔', '五月天'],
    ['Lemon', '米津玄師'],
    ['红色高跟鞋', '蔡健雅'],
    ['夜空中最亮的星', '逃跑计划'],
  ]

  const played = [
    ['若把你', 'KIV'],
    ['光年之外', '邓紫棋'],
    ['悬溺', '葛东琪'],
    ['Dear Reader', 'Taylor Swift'],
  ]

  function applyMock(vm, mode) {
    const now = Date.now()
    const lobbyOnly = mode === 'lobby'
    vm.account = {
      login: true,
      userId: 9100123,
      nickname: '夜航星',
      avatar: avatar('夜', 0),
    }
    vm.message = lobbyOnly ? '预览模式：大厅' : '预览模式（?mock=1）'

    if (lobbyOnly) {
      vm.selectedSong = {
        id: '1901371647',
        name: '这世界那么多人',
        artist: '莫文蔚',
        cover: art(0),
        duration: 278000,
      }
      vm.allowStranger = false
      vm.resumeRoom = {
        roomId: 'r_2f8a1c04b7e94d5f',
        members: 4,
        inviterUid: 9100123,
      }
      return
    }

    vm.roomInfo = {
      roomId: 'r_2f8a1c04b7e94d5f',
      creatorId: 9100123,
      chatRoomId: '88991233',
      roomBizType: 2,
      onlineNums: 20,
      roomType: 'MULTI_MATCH_SONG',
      roomUsers: users.map((user, index) => ({
        uid: index === 0 ? 9100123 : 9100200 + index,
        nickname: user.nickname,
        avatar: avatar(user.nickname, user.index),
      })),
      roomTags: ['一起听', '深夜'],
      hintText: '房间内请保持友好，切歌需要所有人同意。',
      nextRcmdText: '下一个推荐：柚子汽水 的《日落大道》',
      specialOperate: false,
      permission: {
        addSong: true,
        switchSong: true,
        topSong: true,
        specialOperate: false,
      },
    }

    vm.playingInfo = {
      songId: 1901371647,
      bizId: 880011,
      name: '这世界那么多人',
      artist: '莫文蔚',
      cover: art(0),
      playedTime: 72,
      duration: 278,
      status: 'PLAY',
      zanCnt: 12,
      localLiked: 0,
      songRcmdUid: 9100201,
      rcmdType: 1,
      alg: '',
      version: 42,
      upCnt: 5,
      uped: false,
      audioSrc: '',
      actualLevel: 'exhigh',
      nextSongs: queue.map(([name, artist], index) => ({
        songId: 1902000 + index,
        bizId: 880100 + index,
        name,
        artist,
        cover: art(index + 1),
        songRcmdUid: index === 0 ? 9100201 : index === 1 ? 0 : 9100202,
        isMine: index === 1,
      })),
    }

    vm.upCntMap = {}
    vm.playingInfo.nextSongs.forEach((song, index) => {
      vm.upCntMap[String(song.bizId)] = { upCnt: index % 3, uped: index === 0 }
    })

    vm.playedSongs = played.map(([name, artist], index) => ({
      songId: 1903000 + index,
      bizId: 880300 + index,
      name,
      artist,
      cover: art(index + 4),
      songRcmdUid: index === 0 ? 9100202 : 0,
      isMine: index === 0,
      playTime: now - index * 6 * 60 * 1000,
    }))
    vm.playedLoaded = true
    vm.playedMore = true
    vm.playedCursor = 'mock-cursor'

    vm.lyrics = {
      songId: 1901371647,
      title: vm.playingInfo.name,
      loading: false,
      error: '',
      lines: [
        [0, '这世界有那么多人'],
        [8, '人群里 敞着一扇门'],
        [16, '我迷朦的眼睛里长存'],
        [24, '初见你 蓝色清晨'],
        [32, '这世界有那么多人'],
        [40, '多幸运 我有个我们'],
        [48, '这悠长命运中的晨昏'],
        [56, '常让我 望远方出神'],
        [64, '灰树叶飘落 转啊转'],
        [72, '为何孤独 不可 光荣'],
        [80, '人只有不完美 值得歌颂'],
        [88, '谁说污泥满身的不算英雄'],
        [96, '爱你孤身走暗巷'],
        [104, '爱你不跪的模样'],
        [112, '爱你对峙过绝望'],
        [120, '不肯哭一场'],
      ].map(([time, text]) => ({ time, text })),
    }

    vm.chatHistory = [
      {
        id: 'm1',
        sendUid: 9100123,
        nickname: '夜航星',
        avatarUrl: avatar('夜', 0),
        isSystem: false,
        text: '今晚先从这里开始吧 🎧',
        sendTime: now - 26 * 60 * 1000,
      },
      {
        id: 'm2',
        sendUid: 9100201,
        nickname: '柚子汽水',
        avatarUrl: avatar('柚', 1),
        isSystem: false,
        text: '@夜航星 这首我超爱，副歌一定要听完',
        sendTime: now - 24 * 60 * 1000,
      },
      {
        id: 'm3',
        sendUid: 9100202,
        nickname: '午夜电台',
        avatarUrl: avatar('午', 2),
        isSystem: false,
        text: '',
        cover: art(2),
        songName: '日落大道',
        artistName: '梁博',
        suggestSongId: 1902000,
        sendTime: now - 20 * 60 * 1000,
      },
      {
        id: 'm4',
        sendUid: 9100203,
        nickname: 'Kaze',
        avatarUrl: avatar('K', 3),
        isSystem: false,
        text: '点了首《温柔》，排队啦',
        sendTime: now - 8 * 60 * 1000,
      },
      {
        id: 'm5',
        sendUid: null,
        nickname: '系统',
        avatarUrl: '',
        isSystem: true,
        text: 'Kaze 加入了一起听',
        sendTime: now - 6 * 60 * 1000,
      },
      {
        id: 'm-like',
        sendUid: null,
        nickname: '房间互动',
        avatarUrl: '',
        isSystem: true,
        text: '柚子汽水点赞了歌曲《You (feat. Travis Scott)》',
        cover: art(3),
        songName: 'You (feat. Travis Scott)',
        artistName: 'Don Toliver / Travis Scott',
        suggestSongId: 1885063185,
        sendTime: now - 9 * 60 * 1000,
      },
      {
        id: 'm6-sticker',
        sendUid: 9100203,
        nickname: 'Kaze',
        avatarUrl: avatar('K', 3),
        isSystem: false,
        text: '',
        emojiUrl:
          'https://p1.music.126.net/lxA285-v8jSvcJxD1YDjsg==/109951166368227986.gif',
        emoji: {
          emojiId: '3006',
          emojiGroupId: '3001',
          emojiName: '击掌',
          emojiImgUrl:
            'https://p1.music.126.net/lxA285-v8jSvcJxD1YDjsg==/109951166368227986.gif',
          width: 300,
          height: 300,
          format: 'gif',
        },
        sendTime: now - 4 * 60 * 1000,
      },
      {
        id: 'm6',
        sendUid: 9100123,
        nickname: '夜航星',
        avatarUrl: avatar('夜', 0),
        isSystem: false,
        text: '欢迎欢迎，随便点歌～',
        sendTime: now - 2 * 60 * 1000,
      },
    ]
    vm.chatUnread = 2
    vm.chatUnreadAnchor = 'm6'

    vm.cooldownUntil = now + 32 * 1000
    vm.clock = now
    vm.isPolling = true
    vm.sync = { sse: 'open', lastHeartbeat: now, failures: 0 }
    vm.imConnected = true
    vm.imStatus = '已连接（预览）'
    vm.audioPlaying = true
    vm.audioDuration = 278
    vm.audioCurrentTime = 72
    vm.queueTab = 'wait'
    vm.logEntries = [
      { time: now - 9000, tag: 'app', msg: '控制台已加载', data: '' },
      { time: now - 8000, tag: 'Poll', msg: '心跳同步 1', data: '' },
      { time: now - 4000, tag: 'Queue', msg: '同步全量 7 首', data: '' },
    ]
  }

  const mockPlaylists = [
    ['我喜欢的音乐', 0, 128, false, 5],
    ['深夜循环', 1, 24, false, 0],
    ['一起听收藏', 2, 57, true, 0],
    ['City Pop 通勤', 3, 88, true, 0],
  ].map(([name, index, trackCount, subscribed, specialType]) => ({
    id: String(3000000 + index),
    name,
    cover: art(index + 4),
    trackCount,
    subscribed,
    specialType,
    creatorId: subscribed ? 9100999 : 9100123,
  }))

  const baseTracks = [
    ['若把你', 'KIV'],
    ['光年之外', '邓紫棋'],
    ['悬溺', '葛东琪'],
    ['这世界那么多人', '莫文蔚'],
    ['日落大道', '梁博'],
  ]
  const mockPlaylistTracks = Array.from({ length: 30 }, (_, index) => {
    const [name, artist] = baseTracks[index % baseTracks.length]
    return {
      id: String(1904000 + index),
      name: index < baseTracks.length ? name : `${name} (${index + 1})`,
      artist,
      cover: art(index + 1),
      duration: 240000,
    }
  })

  const mockInvite = {
    users: [
      ['Ziby滋补鱼', 0, true, ''],
      ['川雨叚', 1, true, '最近一起听'],
      ['西红柿_XihoS', 2, true, '在线'],
      ['AS148', 3, false, ''],
      ['CareFree_5ky', 4, false, ''],
    ].map(([nickname, index, online, reason], i) => ({
      uid: String(8815511246 + i),
      nickname,
      avatar: avatar(nickname, index),
      online,
      inRoom: i === 2,
      reason,
    })),
    groups: [{ groupId: '99', name: '深夜一起听', memberCount: 6 }],
  }

  const UI_FLAGS = {
    share: 'shareOpen',
    invite: 'inviteOpen',
    settings: 'settingsOpen',
    debug: 'debugOpen',
    members: 'membersOpen',
  }

  function applyMockUi() {
    const ui = new URLSearchParams(location.search).get('ui')
    if (!ui) return
    if (UI_FLAGS[ui]) {
      window.LT.vm[UI_FLAGS[ui]] = true
      return
    }
    if (ui === 'song') {
      const results = [
        {
          id: '1901371647',
          name: '这世界那么多人',
          artist: '莫文蔚',
          cover: art(0),
          duration: 278000,
        },
        {
          id: '1902000',
          name: '日落大道',
          artist: '梁博',
          cover: art(1),
          duration: 245000,
        },
        {
          id: '1902001',
          name: 'Lemon',
          artist: '米津玄師',
          cover: art(2),
          duration: 255000,
        },
      ]
      window.LT.vm.songOpen = true
      window.LT.vm.songDialogMode = 'add'
      window.LT.vm.cooldownUntil = 0
      window.LT.vm.songResults = results
      window.LT.vm.selectedSong = results[0]
      window.LT.vm.preview = {
        songId: Number(results[0].id),
        url: 'mock',
        loading: false,
        playing: false,
        current: 46,
        duration: 218,
        error: '',
        trial: false,
      }
      return
    }
    if (ui === 'chatup') {
      setTimeout(() => {
        window.LT.vm.setPane('chat')
        setTimeout(() => {
          const el = document.getElementById('chatList')
          if (el) {
            el.scrollTop = Math.max(0, el.scrollHeight - el.clientHeight - 360)
          }
          window.LT.vm.chatUnread = 3
          window.LT.vm.chatAtBottom = false
        }, 200)
      }, 900)
      return
    }
    if (ui === 'mylists') {
      window.LT.vm.songOpen = true
      window.LT.vm.songDialogMode = 'add'
      window.LT.vm.pickerTab = 'playlists'
      window.LT.vm.myPlaylists = mockPlaylists
      window.LT.vm.myPlaylistsLoaded = true
      window.LT.vm.myPlaylistsLoading = false
      return
    }
    if (ui === 'playlists') {
      window.LT.vm.songOpen = true
      window.LT.vm.songDialogMode = 'add'
      window.LT.vm.pickerTab = 'playlists'
      window.LT.vm.myPlaylists = mockPlaylists
      window.LT.vm.myPlaylistsLoaded = true
      window.LT.vm.myPlaylistsLoading = false
      window.LT.vm.activePlaylist = mockPlaylists[1]
      window.LT.vm.activePlaylistTracks = mockPlaylistTracks
      window.LT.vm.activePlaylistOffset = mockPlaylistTracks.length
      window.LT.vm.activePlaylistMore = false
      setTimeout(() => {
        const el = document.querySelector('.lt-picker__list')
        if (el) el.scrollTop = 160
      }, 600)
      return
    }
    if (ui === 'collect') {
      window.LT.vm.collectOpen = true
      window.LT.vm.collectSong = {
        id: '1901371647',
        name: '这世界那么多人',
        artist: '莫文蔚',
        cover: art(0),
        duration: 278000,
      }
      window.LT.vm.myPlaylists = mockPlaylists
      window.LT.vm.myPlaylistsLoaded = true
      window.LT.vm.myPlaylistsLoading = false
      return
    }
    if (ui === 'emoji') {
      window.LT.vm.pane = 'chat'
      window.LT.vm.chatOpen = true
      window.LT.vm.emojiPickerOpen = true
      window.LT.vm.emojiTab = 'pack'
      window.LT.vm.cloudLoaded = true
      window.LT.vm.cloudStickers = [
        {
          emojiId: '2731016',
          emojiGroupId: '3001',
          emojiName: '想切歌',
          emojiImgUrl:
            'https://p1.music.126.net/yASanNjqIbz3-JMUW9zAag==/109951167690335088.gif?mock=1',
          width: 300,
          height: 300,
          format: 'gif',
        },
        {
          emojiId: '3006',
          emojiGroupId: '3001',
          emojiName: '击掌',
          emojiImgUrl:
            'https://p1.music.126.net/lxA285-v8jSvcJxD1YDjsg==/109951166368227986.gif?mock=1',
          width: 300,
          height: 300,
          format: 'gif',
        },
      ]
      return
    }
    if (ui === 'quality') {
      window.LT.vm.qualityMenuOpen = true
      return
    }
    if (ui === 'lyrics') {
      window.LT.vm.lyricsOpen = true
      window.LT.vm.loadLyrics()
      return
    }
    if (ui === 'immersive') {
      window.LT.vm.toggleImmersive()
      return
    }
    if (ui === 'landing') {
      window.LT.vm.landingInfo = {
        roomId: 'r_2f8a1c04b7e94d5f',
        inviterUid: 9100201,
        inviterName: '柚子汽水',
        inviterAvatar: avatar('柚', 1),
        roomTypeLabel: '公开匹配房',
        songName: '这世界那么多人',
        songArtist: '莫文蔚',
        songCover: art(0),
        members: 4,
        memberList: users.map((user) => ({
          uid: 9100200 + user.index,
          nickname: user.nickname,
          avatar: avatar(user.nickname, user.index),
        })),
      }
    }
  }

  window.LT.mockInvite = mockInvite
  window.LT.mockPlaylists = mockPlaylists
  window.LT.mockPlaylistTracks = mockPlaylistTracks
  window.LT.applyMock = applyMock
  window.LT.applyMockUi = applyMockUi
  window.LT.mockArt = art
})()

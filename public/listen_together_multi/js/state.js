;(function () {
  'use strict'

  const {
    AUDIO_LEVELS,
    DEFAULT_AUDIO_LEVEL,
    safeStorage,
    loadSavedStickers,
    unicodeEmojis,
    kaomojiList,
  } = window.LT

  function loadLastSelectedSong() {
    try {
      const saved = JSON.parse(safeStorage.get('last_selected_song') || 'null')
      if (!saved || !/^\d{1,24}$/.test(String(saved.id || ''))) return null
      return {
        id: String(saved.id),
        name: String(saved.name || '').slice(0, 200),
        artist: String(saved.artist || '').slice(0, 200),
        cover: String(saved.cover || '').slice(0, 1000),
        duration: Number(saved.duration) || 0,
      }
    } catch (e) {
      return null
    }
  }

  function loadTheme() {
    const theme = safeStorage.get('lt_theme')
    return ['auto', 'dark', 'light'].includes(theme) ? theme : 'dark'
  }

  function loadSearchHistory() {
    const list = safeStorage.json('lt_search_history', [])
    return Array.isArray(list)
      ? list.filter((item) => typeof item === 'string').slice(0, 8)
      : []
  }

  function loadChatDrafts() {
    const map = safeStorage.json('lt_chat_drafts', {})
    return map && typeof map === 'object' ? map : {}
  }

  function loadVolume() {
    const stored = safeStorage.get('audio_volume')
    // 空字符串表示「从未设置」；显式的 0 是静音，必须保留，否则刷新后会突然满音量
    if (stored === '') return 1
    const raw = Number(stored)
    if (!Number.isFinite(raw) || raw < 0) return 1
    return Math.min(1, Math.max(0, raw))
  }

  function createState() {
    return {
      /* ---------- 账号 / 房间 ---------- */
      message: '正在初始化…',
      account: { login: false, userId: 0, nickname: '', avatar: '' },
      roomInfo: {
        roomId: null,
        creatorId: 0,
        chatRoomId: '',
        roomBizType: 0,
        roomType: '',
        roomUsers: [],
        onlineNums: 0,
        roomTags: [],
        hintText: '',
        nextRcmdText: '',
        specialOperate: false,
        permission: {
          addSong: true,
          switchSong: true,
          topSong: true,
          specialOperate: false,
        },
      },

      /* ---------- 播放 ---------- */
      playingInfo: {
        songId: 0,
        bizId: 0,
        name: '',
        artist: '',
        cover: '',
        playedTime: 0,
        duration: 0,
        status: 'PLAY',
        zanCnt: 0,
        localLiked: 0,
        songRcmdUid: 0,
        rcmdType: 0,
        alg: '',
        version: 0,
        upCnt: 0,
        uped: false,
        nextSongs: [],
        audioSrc: '',
        actualLevel: '',
      },
      upCntMap: {},
      likedMap: {},
      userNameCache: {},

      audioLevel: safeStorage.get('audio_level') || DEFAULT_AUDIO_LEVEL,
      audioLevels: AUDIO_LEVELS,
      audioCurrentTime: 0,
      audioDuration: 0,
      audioPlaying: false,
      audioSwitching: false,
      audioVolume: loadVolume(),
      audioMuted: false,
      // 用户主动暂停后，页面任意点击都不应再自动恢复播放
      localPaused: false,

      /* ---------- 队列 ---------- */
      queueTab: 'wait',
      playedSongs: [],
      playedCursor: '',
      playedMore: false,
      playedLoading: false,
      playedLoaded: false,
      lastQueueVersion: 0,

      /* ---------- 大厅 / 匹配 ---------- */
      inputSongId: '',
      allowStranger: false,
      shareLinkInput: '',
      shareResolving: false,
      joinForm: { roomId: '', inviterId: '' },
      joinOpen: false,
      resumeRoom: null,
      isMatching: false,
      rematching: false,
      matchStartedAt: 0,
      nextAddSongDuration: 0,
      cooldownUntil: 0,

      /* ---------- 选歌 ---------- */
      songInput: '',
      songResults: [],
      songSearching: false,
      selectedSong: null,
      lastSelectedSong: loadLastSelectedSong(),
      songOpen: false,
      songDialogMode: 'add',
      pickerTab: 'search',
      myPlaylists: [],
      myPlaylistsLoaded: false,
      myPlaylistsLoading: false,
      myPlaylistsError: '',
      activePlaylist: null,
      activePlaylistTracks: [],
      activePlaylistOffset: 0,
      activePlaylistMore: false,
      activePlaylistLoading: false,
      activePlaylistError: '',
      collectOpen: false,
      collectSong: null,
      collectLoading: false,
      collectError: '',
      searchHistory: loadSearchHistory(),
      searchOffset: 0,
      searchMore: false,

      /* ---------- 聊天 ---------- */
      chatInput: '',
      chatHistory: [],
      chatSending: false,
      chatOpen: false,
      chatTab: 'chat',
      chatUnread: 0,
      chatUnreadAnchor: '',
      chatMore: false,
      chatCursor: '',
      chatCursorLoaded: false,
      chatLoadingMore: false,
      chatAllPagesLoaded: false,
      chatAtBottom: true,
      chatDrafts: loadChatDrafts(),
      mentionOpen: false,
      mentionQuery: '',
      mentionIndex: 0,
      emojiPickerOpen: false,
      qualityMenuOpen: false,
      emojiTab: 'pack',
      emojiUrlInput: '',
      emojiSaving: false,
      savedStickers: loadSavedStickers(),
      cloudStickers: [],
      cloudGroups: [],
      cloudGroupId: '',
      cloudCursor: '',
      cloudMore: false,
      cloudLoading: false,
      cloudLoaded: false,
      cloudError: '',
      unicodeEmojis,
      kaomojiList,

      /* ---------- 选歌试听 ---------- */
      preview: {
        songId: 0,
        url: '',
        loading: false,
        playing: false,
        current: 0,
        duration: 0,
        error: '',
        trial: false,
      },

      /* ---------- 歌词 ---------- */
      lyricsOpen: false,
      lyricsFollow: true,
      lyrics: { lines: [], title: '', loading: false, error: '', songId: 0 },

      /* ---------- 界面 ---------- */
      theme: loadTheme(),
      systemDark: true,
      pane: 'stage',
      immersive: false,
      membersOpen: false,
      shareOpen: false,
      inviteOpen: false,
      settingsOpen: false,
      debugOpen: false,
      leaveMenuOpen: false,
      landingInfo: null,
      toasts: [],
      clock: Date.now(),
      logEntries: [],
      logLevelFilters: { error: true, warn: true, info: true, debug: true },
      logModuleFilter: 'all',
      debugCapture: false,
      sync: { sse: 'idle', lastHeartbeat: 0, failures: 0, lastIm: 0 },

      /* ---------- 邀请面板 ---------- */
      inviteUsers: [],
      inviteGroups: [],
      inviteSelected: [],
      inviteGroupsSelected: [],
      inviteLoading: false,
      inviteError: '',
      inviteSending: false,

      /* ---------- 扫码登录 ---------- */
      qr: { img: '', status: 'idle', text: '正在获取二维码…', key: '' },

      /* ---------- 连接 / 轮询 ---------- */
      imConnected: false,
      imConnecting: false,
      imStatus: '',
      refreshing: false,
      creatingRoom: false,
      joiningRoom: false,
      pollTimer: null,
      isPolling: false,
      pollGeneration: 0,
      lastHeartbeatTime: 0,
      lastStatusTime: 0,
      lastChatTime: 0,
      matchTimeoutTimer: null,
      emptyRoomCount: 0,
      statusFetching: false,
      consecutiveFailures: 0,

      mockMode: false,
    }
  }

  window.LT.createState = createState
})()

(function () {
const { AUDIO_LEVELS, DEFAULT_AUDIO_LEVEL, safeStorage, loadSavedStickers } = window.LT
const CHAT_FAB_SIZE = 58
function loadChatButtonPos() {
  const width = Number(window.innerWidth) || 1024
  const height = Number(window.innerHeight) || 768
  const fallback = {
    x: Math.max(8, width - CHAT_FAB_SIZE - 20),
    y: Math.max(8, height - CHAT_FAB_SIZE - 30),
  }
  try {
    const saved = JSON.parse(safeStorage.get('chat_button_pos') || 'null')
    if (
      saved &&
      Number.isFinite(Number(saved.x)) &&
      Number.isFinite(Number(saved.y))
    )
      return {
        x: Math.min(
          Math.max(8, Number(saved.x)),
          Math.max(8, width - CHAT_FAB_SIZE - 8),
        ),
        y: Math.min(
          Math.max(8, Number(saved.y)),
          Math.max(8, height - CHAT_FAB_SIZE - 8),
        ),
      }
  } catch (e) {}
  return fallback
}
function createState() {
          return {
            message: '请先登录',
            account: { login: false, userId: 0, nickname: '' },
            roomInfo: {
              roomId: null,
              creatorId: 0,
              chatRoomId: '',
              roomBizType: 0,
              roomType: '',
              roomUsers: [],
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

            inputSongId: '1372188635',
            allowStranger: false,
            shareLinkInput: '',
            shareResolving: false,
            joinForm: { roomId: '', inviterId: '' },
            isMatching: false,
            nextAddSongDuration: 0,

            chatInput: '',
            chatHistory: [],
            chatSending: false,
            chatOpen: false,
            chatTab: 'chat',
            chatUnread: 0,
            chatDragging: false,
            chatButtonPos: loadChatButtonPos(),
            viewportWidth: Number(window.innerWidth) || 1024,
            viewportHeight: Number(window.innerHeight) || 768,
            logEntries: [],

            emojiPickerOpen: false,
            emojiTab: 'builtin',
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

            songQuery: '',
            songResults: [],
            songSearching: false,
            selectedSong: null,

            imConnected: false,
            imStatus: '',

            refreshing: false,
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
            chatAllPagesLoaded: false,
            audioLevel: safeStorage.get('audio_level') || DEFAULT_AUDIO_LEVEL,
            audioLevels: AUDIO_LEVELS,
            userNameCache: {},
            likedMap: {},
            lastQueueVersion: 0,
          }
        }

window.LT.createState = createState
})()

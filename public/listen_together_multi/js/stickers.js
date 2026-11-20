(function () {
const { safeStorage } = window.LT
const LISTEN_STICKERS = [
        { emojiId: '3009', emojiGroupId: '3001', emojiName: '求UP', emojiImgUrl: 'https://p1.music.126.net/Rr8cgtWOBggaR70rrmIzHA==/109951167690335323.gif', width: 300, height: 300, format: 'gif' },
        { emojiId: '3006', emojiGroupId: '3001', emojiName: '击掌', emojiImgUrl: 'https://p1.music.126.net/lxA285-v8jSvcJxD1YDjsg==/109951166368227986.gif', width: 300, height: 300, format: 'gif' },
        { emojiId: '3010', emojiGroupId: '3001', emojiName: '摇摆', emojiImgUrl: 'https://p1.music.126.net/a8nAAW02-K7TC5nWwyYPgg==/109951166368203819.gif', width: 300, height: 300, format: 'gif' },
        { emojiId: '2731016', emojiGroupId: '3001', emojiName: '想切歌', emojiImgUrl: 'https://p1.music.126.net/yASanNjqIbz3-JMUW9zAag==/109951167690335088.gif', width: 300, height: 300, format: 'gif' },
        { emojiId: '3002', emojiGroupId: '3001', emojiName: 'hi', emojiImgUrl: 'https://p1.music.126.net/Tz0brSYCab9atwwkOQgcPg==/109951166368242023.gif', width: 300, height: 300, format: 'gif' },
        { emojiId: '3003', emojiGroupId: '3001', emojiName: '棒', emojiImgUrl: 'https://p1.music.126.net/wwYG_FKFjXOuR9gdXtEnnQ==/109951166368242005.gif', width: 300, height: 300, format: 'gif' },
        { emojiId: '3005', emojiGroupId: '3001', emojiName: '蹦迪', emojiImgUrl: 'https://p1.music.126.net/CkOFk0uhAAjd5lsLPf5lJQ==/109951166368234783.gif', width: 300, height: 300, format: 'gif' },
        { emojiId: '3007', emojiGroupId: '3001', emojiName: '陶醉', emojiImgUrl: 'https://p1.music.126.net/zxS5ekJuRrWPiGuv-1-7QA==/109951166368233763.gif', width: 300, height: 300, format: 'gif' },
        { emojiId: '3001', emojiGroupId: '3001', emojiName: 'bye', emojiImgUrl: 'https://p1.music.126.net/uNb_18IqV2XYfC8Lcji21Q==/109951166371461723.gif', width: 300, height: 300, format: 'gif' },
        { emojiId: '3004', emojiGroupId: '3001', emojiName: '抱抱', emojiImgUrl: 'https://p1.music.126.net/zFNse1bJtWlyBeQ4yQWFlQ==/109951166368226495.gif', width: 300, height: 300, format: 'gif' },
        { emojiId: '3008', emojiGroupId: '3001', emojiName: '哇哦', emojiImgUrl: 'https://p1.music.126.net/ck02pd_xipp_SgHnnLCDyw==/109951166368236137.gif', width: 300, height: 300, format: 'gif' },
        { emojiId: '6004', emojiGroupId: '3001', emojiName: '害羞', emojiImgUrl: 'https://p1.music.126.net/0HYKllm6UcQASj4GUikPJg==/109951166371262409.gif', width: 300, height: 300, format: 'gif' },
      ]

const loadSavedStickers = () => {
        try {
          const value = JSON.parse(safeStorage.get('saved_stickers') || '[]')
          return Array.isArray(value) ? value.filter((item) => item && item.emojiImgUrl).slice(0, 60) : []
        } catch (e) {
          return []
        }
      }


window.LT.LISTEN_STICKERS = LISTEN_STICKERS
window.LT.loadSavedStickers = loadSavedStickers
})()

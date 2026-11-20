const assert = require('assert')
const landing = require('../module/listentogether_multi_landing_info')
const played = require('../module/listentogether_multi_match_played_song_list')
const songInfo = require('../module/listentogether_multi_played_song_info')
const mutual = require('../module/listentogether_mutual_follows_get_v2')
const collect = require('../module/social_emoji_collect')
const groups = require('../module/social_emoji_groups')
const groupPage = require('../module/social_emoji_groups_detail_page')

const capture = (module, query) => {
  let result
  module(query, (uri, data, options) => {
    result = { uri, data, options }
    return { body: {} }
  })
  return result
}

describe('multi-listen endpoints used by music-party', () => {
  it('builds the landing preview request', () => {
    const call = capture(landing, { roomId: 'r_1', inviterUid: '42' })
    assert.strictEqual(call.uri, '/api/listen/together/multi/landing/info/get')
    assert.deepStrictEqual(call.data, { roomId: 'r_1', inviterUid: '42' })
  })

  it('builds the played-song page request', () => {
    const call = capture(played, { roomId: 'r_1', cursor: '0_1' })
    assert.strictEqual(
      call.uri,
      '/api/listen/together/multi/match/played/song/list',
    )
    assert.strictEqual(call.data.roomId, 'r_1')
    assert.strictEqual(call.data.sort, 1)
    assert.strictEqual(call.data.page, '{"size":20,"cursor":"0_1"}')
  })

  it('accepts bizId as an alias for songBizId', () => {
    const call = capture(songInfo, { roomId: 'r_1', bizId: '123' })
    assert.strictEqual(call.uri, '/api/listen/together/multi/played/song/info')
    assert.deepStrictEqual(call.data, { roomId: 'r_1', songBizId: '123' })
  })

  it('builds the invite-panel request', () => {
    const call = capture(mutual, { roomId: 'r_1', songId: '123' })
    assert.strictEqual(call.uri, '/api/listen/together/mutual/follows/get/v2')
    assert.deepStrictEqual(call.data, { roomId: 'r_1', songId: '123' })
  })

  it('builds the sticker collect request', () => {
    const call = capture(collect, { emojiId: '3002', emojiGroupId: '3001' })
    assert.strictEqual(call.uri, '/api/social/emoji/collect')
    assert.deepStrictEqual(call.data, { emojiId: '3002', emojiGroupId: '3001' })
  })

  it('builds the sticker group list request', () => {
    const call = capture(groups, { resourceType: 3 })
    assert.strictEqual(call.uri, '/api/social/emoji/groups')
    assert.deepStrictEqual(call.data, { resourceType: 3 })
  })

  it('builds the sticker group page request', () => {
    const call = capture(groupPage, {
      emojiGroupId: '1',
      cursor: 'next',
      size: 20,
    })
    assert.strictEqual(call.uri, '/api/social/emoji/groups/detail/page')
    assert.deepStrictEqual(call.data, {
      emojiGroupId: '1',
      cursor: 'next',
      size: 20,
    })
  })
})

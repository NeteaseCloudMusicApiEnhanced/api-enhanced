const assert = require('assert')
const { parseMatch } = require('../util/match-events')

const envelope = (subType, data) =>
  JSON.stringify({
    msgType: 133,
    bizType: 'music_listenTogether_multi_match_song',
    serverExt: JSON.stringify({ subType, data }),
  })

describe('multi-listen match notification parser', () => {
  it('parses STRANGER_MULTI_MATCH_WAIT_ACK', () => {
    assert.deepStrictEqual(
      parseMatch(envelope('STRANGER_MULTI_MATCH_WAIT_ACK', { roomId: 'abc_1' })),
      { type: 'ready', roomId: 'abc_1' },
    )
  })

  it('parses STRANGER_MULTI_MATCH_FAILED', () => {
    assert.deepStrictEqual(
      parseMatch(envelope('STRANGER_MULTI_MATCH_FAILED', { failedType: 'NO_USER' })),
      { type: 'failed', reason: 'NO_USER' },
    )
  })

  it('ignores other businesses and malformed payloads', () => {
    assert.strictEqual(parseMatch('not json'), null)
    assert.strictEqual(
      parseMatch(
        JSON.stringify({
          msgType: 133,
          bizType: 'music_communication_realtime_msg_notice',
          serverExt: '{}',
        }),
      ),
      null,
    )
  })
})

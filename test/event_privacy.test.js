const assert = require('assert')
const eventPrivacy = require('../module/event_privacy')

describe('event privacy modules', () => {
  it('updates event privacy with the official client parameters', async () => {
    let captured
    const expected = { status: 200, body: { code: 200 }, cookie: [] }
    const result = await eventPrivacy(
      { evId: '123456789012345678', privacy: '0', cookie: { MUSIC_U: 'x' } },
      async (uri, data, options) => {
        captured = { uri, data, options }
        return expected
      },
    )

    assert.strictEqual(result, expected)
    assert.strictEqual(captured.uri, '/api/event/privacy/op')
    assert.deepStrictEqual(captured.data, {
      eventId: '123456789012345678',
      privacy: 0,
    })
    assert.strictEqual(captured.options.crypto, '')
  })

  it('rejects unknown event privacy values before making a request', async () => {
    let requested = false
    const result = await eventPrivacy({ evId: '1', privacy: '3' }, async () => {
      requested = true
    })

    assert.strictEqual(requested, false)
    assert.strictEqual(result.status, 400)
  })
})

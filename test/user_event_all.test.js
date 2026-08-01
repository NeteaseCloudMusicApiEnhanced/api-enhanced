const assert = require('assert')
const userEventAll = require('../module/user_event_all')

describe('all current user events module', () => {
  it('resolves the current user and aggregates every upstream page', async () => {
    const calls = []
    const pages = [
      {
        status: 200,
        body: {
          code: 200,
          events: [{ id: 1 }, { id: 2 }],
          size: 5,
          more: true,
          lasttime: 100,
        },
        cookie: ['page=1'],
      },
      {
        status: 200,
        body: {
          code: 200,
          events: [{ id: 2 }, { id: 3 }],
          size: 5,
          more: true,
          lasttime: 50,
        },
        cookie: ['page=2'],
      },
      {
        status: 200,
        body: {
          code: 200,
          events: [{ id: 4 }],
          size: 1,
          more: false,
          lasttime: 0,
        },
        cookie: ['page=3'],
      },
    ]

    const result = await userEventAll(
      { cookie: { MUSIC_U: 'x' } },
      async (uri, data, options) => {
        calls.push({ uri, data, options })
        if (uri === '/api/nuser/account/get') {
          return {
            status: 200,
            body: { code: 200, account: { id: 42 } },
            cookie: ['account=1'],
          }
        }
        return pages.shift()
      },
    )

    assert.deepStrictEqual(
      result.body.events.map((event) => event.id),
      [1, 2, 3, 4],
    )
    assert.strictEqual(result.body.size, 5)
    assert.strictEqual(result.body.retrievedCount, 4)
    assert.strictEqual(result.body.unavailableCount, 1)
    assert.strictEqual(result.body.sizeMismatch, true)
    assert.strictEqual(result.body.pageCount, 3)
    assert.strictEqual(result.body.more, false)
    assert.deepStrictEqual(result.cookie, [
      'account=1',
      'page=1',
      'page=2',
      'page=3',
    ])

    assert.strictEqual(calls[0].uri, '/api/nuser/account/get')
    assert.strictEqual(calls[0].options.crypto, 'weapi')
    assert.deepStrictEqual(
      calls.slice(1).map((call) => call.data),
      [
        {
          getcounts: true,
          time: -1,
          limit: 100,
          total: false,
          fromRN: 'true',
        },
        {
          getcounts: true,
          time: 100,
          limit: 100,
          total: false,
          fromRN: 'true',
        },
        {
          getcounts: true,
          time: 50,
          limit: 100,
          total: false,
          fromRN: 'true',
        },
      ],
    )
  })

  it('requires a valid login cookie', async () => {
    const result = await userEventAll({}, async () => ({
      status: 200,
      body: { code: 200, account: null, profile: null },
      cookie: [],
    }))

    assert.strictEqual(result.status, 401)
    assert.strictEqual(result.body.code, 401)
  })

  it('fails instead of returning a partial list when the cursor stalls', async () => {
    let page = 0
    const result = await userEventAll({}, async (uri) => {
      if (uri === '/api/nuser/account/get') {
        return {
          status: 200,
          body: { code: 200, account: { id: 42 } },
          cookie: [],
        }
      }

      page += 1
      return {
        status: 200,
        body: {
          code: 200,
          events: [],
          size: 1,
          more: true,
          lasttime: 100,
        },
        cookie: [],
      }
    })

    assert.strictEqual(page, 2)
    assert.strictEqual(result.status, 502)
    assert.match(result.body.message, /cursor stalled/)
  })
})

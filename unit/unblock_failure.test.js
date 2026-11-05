const assert = require('assert')
const Module = require('module')

const songUrlV1 = require('../module/song_url_v1')

const UNBLOCK_PACKAGE = '@neteasecloudmusicapienhanced/unblockmusic-utils'

const officialResponse = {
  status: 200,
  body: { code: 200, data: [{ url: 'https://official.example/preview.mp3' }] },
}

// Replace selected require() targets for the duration of one call, so this test
// stays a hermetic unit test (it does not need the unblock package installed and
// never touches the network).
async function withStubs(stubs, fn) {
  const originalLoad = Module._load
  Module._load = function (request, parent, isMain) {
    if (Object.prototype.hasOwnProperty.call(stubs, request)) {
      return stubs[request]
    }
    return originalLoad.call(this, request, parent, isMain)
  }
  try {
    return await fn()
  } finally {
    Module._load = originalLoad
  }
}

const dotenvStub = { config: () => ({ parsed: {} }) }

function mockUnblock(matchID) {
  return {
    [UNBLOCK_PACKAGE]: { matchID },
    dotenv: dotenvStub,
  }
}

// 断言失败响应只包含稳定的 msg + 机器码，不泄露内部错误文本。
function assertFailureShape(response, expected) {
  assert.strictEqual(response.status, expected.status)
  assert.strictEqual(response.body.code, expected.code)
  assert.strictEqual(response.body.error, expected.error)
  assert.strictEqual(response.body.msg, expected.msg)
  assert.deepStrictEqual(response.body.data, [])
}

describe('song/url/v1 unblock failure semantics', () => {
  it('returns HTTP 500 with a stable error code when no source is available', async () => {
    let officialCalled = false
    const response = await withStubs(
      mockUnblock(async () => ({
        code: 500,
        message: 'No available source found',
        data: null,
      })),
      () =>
        songUrlV1(
          { id: '1869929814', level: 'exhigh', unblock: 'true' },
          () => {
            officialCalled = true
            return officialResponse
          },
        ),
    )

    assert.strictEqual(
      officialCalled,
      false,
      'unblock failure must not fall through to the official API',
    )
    assertFailureShape(response, {
      status: 500,
      code: 500,
      error: 'NO_AVAILABLE_SOURCE',
      msg: 'unblock failed: no available source',
    })
  })

  it('keeps the 404 semantics when the requested source does not exist', async () => {
    const response = await withStubs(
      mockUnblock(async () => ({
        code: 404,
        message: 'Module nosuchmodule not found',
        data: null,
      })),
      () =>
        songUrlV1(
          {
            id: '1869929814',
            level: 'exhigh',
            unblock: 'true',
            source: 'nosuchmodule',
          },
          () => officialResponse,
        ),
    )

    assertFailureShape(response, {
      status: 404,
      code: 404,
      error: 'MODULE_NOT_FOUND',
      msg: 'unblock failed: source module not found',
    })
  })

  it('keeps the 400 semantics when the id is missing', async () => {
    const response = await withStubs(
      mockUnblock(async () => ({
        code: 400,
        message: 'Missing id parameter',
        data: null,
      })),
      () =>
        songUrlV1({ level: 'exhigh', unblock: 'true' }, () => officialResponse),
    )

    assertFailureShape(response, {
      status: 400,
      code: 400,
      error: 'MISSING_ID',
      msg: 'unblock failed: missing id',
    })
  })

  it('converts unexpected exceptions into a stable 500 without leaking details', async () => {
    const response = await withStubs(
      mockUnblock(async () => {
        throw new Error('boom: secret internal detail')
      }),
      () =>
        songUrlV1(
          { id: '1', level: 'exhigh', unblock: 'true' },
          () => officialResponse,
        ),
    )

    assertFailureShape(response, {
      status: 500,
      code: 500,
      error: 'INTERNAL_ERROR',
      msg: 'unblock failed: internal error',
    })
    const body = JSON.stringify(response.body)
    assert.ok(
      !body.includes('secret internal detail'),
      'internal message must not leak',
    )
  })

  it('rejects malformed success payloads (code 200 without a usable url)', async () => {
    const response = await withStubs(
      mockUnblock(async () => ({
        code: 200,
        message: 'success',
        data: { url: null },
      })),
      () =>
        songUrlV1(
          { id: '1', level: 'exhigh', unblock: 'true' },
          () => officialResponse,
        ),
    )

    assertFailureShape(response, {
      status: 500,
      code: 500,
      error: 'INTERNAL_ERROR',
      msg: 'unblock failed: internal error',
    })
  })

  it('keeps the success response shape unchanged', async () => {
    const response = await withStubs(
      mockUnblock(async () => ({
        code: 200,
        message: 'success',
        data: { url: 'https://unblock.example/song.flac', source: 'qijieya' },
      })),
      () =>
        songUrlV1(
          { id: '1869929814', level: 'exhigh', unblock: 'true' },
          () => officialResponse,
        ),
    )

    assert.strictEqual(response.status, 200)
    assert.strictEqual(response.body.code, 200)
    const [song] = response.body.data
    assert.strictEqual(song.id, 1869929814)
    assert.strictEqual(song.url, 'https://unblock.example/song.flac')
    assert.strictEqual(song.type, 'flac')
    assert.strictEqual(song.level, 'exhigh')
    assert.strictEqual(song.freeTrialInfo, 'null')
    assert.strictEqual(song.fee, 0)
  })

  it('still uses the official API when unblock is not requested', async () => {
    let officialCalled = false
    const response = await withStubs(
      mockUnblock(async () => {
        throw new Error('matchID must not be called without unblock=true')
      }),
      () =>
        songUrlV1({ id: '1', level: 'exhigh' }, (path) => {
          officialCalled = true
          assert.strictEqual(path, '/api/song/enhance/player/url/v1')
          return officialResponse
        }),
    )

    assert.strictEqual(officialCalled, true)
    assert.strictEqual(response.body.code, 200)
  })

  // interface.d.ts 允许 `unblock?: 'true' | 'false' | boolean`；库调用 (main.js) 直接把对象
  // 透传给模块，所以布尔 true 必须和解灰分支的 'true' 等价，否则会静默回落到官方试听。
  it('treats the boolean true from the library API as a request to unblock', async () => {
    let matchIDCalls = 0
    const response = await withStubs(
      mockUnblock(async () => {
        matchIDCalls += 1
        return {
          code: 200,
          message: 'success',
          data: { url: 'https://unblock.example/lib.flac' },
        }
      }),
      () =>
        songUrlV1({ id: '1869929814', level: 'exhigh', unblock: true }, () => {
          throw new Error('must not fall through to the official API')
        }),
    )

    assert.strictEqual(matchIDCalls, 1)
    assert.strictEqual(response.status, 200)
    assert.strictEqual(response.body.code, 200)
    assert.strictEqual(
      response.body.data[0].url,
      'https://unblock.example/lib.flac',
    )
  })

  it('propagates the failure status for the boolean form as well', async () => {
    const response = await withStubs(
      mockUnblock(async () => ({
        code: 500,
        message: 'No available source found',
        data: null,
      })),
      () =>
        songUrlV1({ id: '1', level: 'exhigh', unblock: true }, () => {
          throw new Error('must not fall through to the official API')
        }),
    )

    assertFailureShape(response, {
      status: 500,
      code: 500,
      error: 'NO_AVAILABLE_SOURCE',
      msg: 'unblock failed: no available source',
    })
  })

  it('does not unblock when unblock is explicitly false', async () => {
    let officialCalled = false
    const response = await withStubs(
      mockUnblock(async () => {
        throw new Error('matchID must not be called when unblock=false')
      }),
      () =>
        songUrlV1({ id: '1', level: 'exhigh', unblock: false }, () => {
          officialCalled = true
          return officialResponse
        }),
    )

    assert.strictEqual(officialCalled, true)
    assert.strictEqual(response.body.code, 200)
  })
})

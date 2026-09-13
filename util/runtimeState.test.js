const assert = require('assert')

describe('util/runtimeState', () => {
  let runtimeState

  beforeEach(() => {
    // 每个用例从干净状态开始，并清掉可能影响 seed 的环境变量
    delete process.env.NETEASE_ANONYMOUS_TOKEN
    delete process.env.NETEASE_XEAPI_PUBLIC_KEY
    delete require.cache[require.resolve('./runtimeState')]
    runtimeState = require('./runtimeState')
  })

  afterEach(() => {
    delete process.env.NETEASE_ANONYMOUS_TOKEN
    delete process.env.NETEASE_XEAPI_PUBLIC_KEY
  })

  describe('anonymous token', () => {
    it('set/get 往返', () => {
      runtimeState.setAnonymousToken('TOKEN_A')
      assert.strictEqual(runtimeState.getAnonymousToken(), 'TOKEN_A')
    })

    it('set 忽略空值，不覆盖已有 token', () => {
      runtimeState.setAnonymousToken('TOKEN_A')
      runtimeState.setAnonymousToken('')
      runtimeState.setAnonymousToken(null)
      assert.strictEqual(runtimeState.getAnonymousToken(), 'TOKEN_A')
    })

    it('优先从环境变量读取种子（需显式 loadSeed）', () => {
      process.env.NETEASE_ANONYMOUS_TOKEN = 'ENV_TOKEN'
      assert.strictEqual(runtimeState.getAnonymousToken(), '')
      runtimeState.loadSeed()
      assert.strictEqual(runtimeState.getAnonymousToken(), 'ENV_TOKEN')
    })

    it('缺失时 ensureAnonymousToken 调用 refresh 并写入', async () => {
      let calls = 0
      const token = await runtimeState.ensureAnonymousToken(async () => {
        calls++
        return 'FRESH_TOKEN'
      })
      assert.strictEqual(token, 'FRESH_TOKEN')
      assert.strictEqual(runtimeState.getAnonymousToken(), 'FRESH_TOKEN')
      assert.strictEqual(calls, 1)
    })

    it('已有 token 时 ensureAnonymousToken 不再调用 refresh', async () => {
      runtimeState.setAnonymousToken('CACHED')
      let calls = 0
      const token = await runtimeState.ensureAnonymousToken(async () => {
        calls++
        return 'FRESH'
      })
      assert.strictEqual(token, 'CACHED')
      assert.strictEqual(calls, 0)
    })

    it('并发调用共享同一个刷新任务（去重）', async () => {
      let calls = 0
      const slowRefresh = () =>
        new Promise((resolve) =>
          setTimeout(() => {
            calls++
            resolve('SHARED_TOKEN')
          }, 20),
        )

      const results = await Promise.all([
        runtimeState.ensureAnonymousToken(slowRefresh),
        runtimeState.ensureAnonymousToken(slowRefresh),
        runtimeState.ensureAnonymousToken(slowRefresh),
      ])

      assert.deepStrictEqual(results, [
        'SHARED_TOKEN',
        'SHARED_TOKEN',
        'SHARED_TOKEN',
      ])
      assert.strictEqual(calls, 1)
    })

    it('refresh 失败后任务被清理，可再次重试', async () => {
      await assert.rejects(
        runtimeState.ensureAnonymousToken(async () => {
          throw new Error('boom')
        }),
      )
      assert.strictEqual(runtimeState.isAnonymousTokenRefreshing(), false)

      const token = await runtimeState.ensureAnonymousToken(
        async () => 'RETRY_OK',
      )
      assert.strictEqual(token, 'RETRY_OK')
    })

    it('刷新期间 isAnonymousTokenRefreshing 为 true', async () => {
      let sawRefreshing = false
      await runtimeState.ensureAnonymousToken(async () => {
        sawRefreshing = runtimeState.isAnonymousTokenRefreshing()
        return 'X'
      })
      assert.strictEqual(sawRefreshing, true)
      assert.strictEqual(runtimeState.isAnonymousTokenRefreshing(), false)
    })
  })

  describe('xeapi public key', () => {
    it('set/get 往返', () => {
      runtimeState.setXeapiPublicKey({ publicKey: 'PK', version: 'v1' })
      assert.deepStrictEqual(runtimeState.getXeapiPublicKey(), {
        publicKey: 'PK',
        version: 'v1',
      })
    })

    it('优先从环境变量读取 JSON 种子（需显式 loadSeed）', () => {
      process.env.NETEASE_XEAPI_PUBLIC_KEY = JSON.stringify({
        publicKey: 'ENV_PK',
        version: 'env-v',
      })
      assert.strictEqual(runtimeState.getXeapiPublicKey(), null)
      runtimeState.loadSeed()
      assert.deepStrictEqual(runtimeState.getXeapiPublicKey(), {
        publicKey: 'ENV_PK',
        version: 'env-v',
      })
    })

    it('环境变量中的非法 JSON 被忽略', () => {
      process.env.NETEASE_XEAPI_PUBLIC_KEY = 'not-json'
      runtimeState.loadSeed()
      assert.strictEqual(runtimeState.getXeapiPublicKey(), null)
    })

    it('mergeXeapiPublicKey 保留旧 sk（服务端未下发时）', () => {
      runtimeState.setXeapiPublicKey({ publicKey: 'PK1', sk: 'SK1' })
      const merged = runtimeState.mergeXeapiPublicKey({ publicKey: 'PK2' })
      assert.strictEqual(merged.sk, 'SK1')
      assert.strictEqual(merged.publicKey, 'PK2')
    })

    it('mergeXeapiPublicKey 优先使用新 sk', () => {
      runtimeState.setXeapiPublicKey({ publicKey: 'PK1', sk: 'SK1' })
      const merged = runtimeState.mergeXeapiPublicKey({
        publicKey: 'PK2',
        sk: 'SK2',
      })
      assert.strictEqual(merged.sk, 'SK2')
    })

    it('缺失时 ensureXeapiPublicKey 调用 refresh 并合并写入', async () => {
      let calls = 0
      const result = await runtimeState.ensureXeapiPublicKey(async () => {
        calls++
        return { publicKey: 'FRESH_PK', version: 'v2' }
      })
      assert.strictEqual(calls, 1)
      assert.deepStrictEqual(result, { publicKey: 'FRESH_PK', version: 'v2' })
      assert.deepStrictEqual(runtimeState.getXeapiPublicKey(), {
        publicKey: 'FRESH_PK',
        version: 'v2',
      })
    })

    it('已有 key 且未 force 时不刷新', async () => {
      runtimeState.setXeapiPublicKey({ publicKey: 'CACHED' })
      let calls = 0
      const result = await runtimeState.ensureXeapiPublicKey(async () => {
        calls++
        return { publicKey: 'FRESH' }
      })
      assert.strictEqual(calls, 0)
      assert.strictEqual(result.publicKey, 'CACHED')
    })

    it('force 时即使已有 key 也刷新', async () => {
      runtimeState.setXeapiPublicKey({ publicKey: 'CACHED', sk: 'OLD_SK' })
      let calls = 0
      const result = await runtimeState.ensureXeapiPublicKey(
        async () => {
          calls++
          return { publicKey: 'FRESH' }
        },
        { force: true },
      )
      assert.strictEqual(calls, 1)
      assert.strictEqual(result.publicKey, 'FRESH')
      // 旧 sk 被保留
      assert.strictEqual(result.sk, 'OLD_SK')
    })

    it('并发 ensureXeapiPublicKey 共享同一刷新任务', async () => {
      let calls = 0
      const slowRefresh = () =>
        new Promise((resolve) =>
          setTimeout(() => {
            calls++
            resolve({ publicKey: 'SHARED_PK' })
          }, 20),
        )

      const results = await Promise.all([
        runtimeState.ensureXeapiPublicKey(slowRefresh),
        runtimeState.ensureXeapiPublicKey(slowRefresh),
      ])

      assert.strictEqual(calls, 1)
      assert.strictEqual(results[0].publicKey, 'SHARED_PK')
      assert.strictEqual(results[1].publicKey, 'SHARED_PK')
    })

    it('刷新期间 isXeapiPublicKeyRefreshing 为 true', async () => {
      let sawRefreshing = false
      await runtimeState.ensureXeapiPublicKey(async () => {
        sawRefreshing = runtimeState.isXeapiPublicKeyRefreshing()
        return { publicKey: 'X' }
      })
      assert.strictEqual(sawRefreshing, true)
      assert.strictEqual(runtimeState.isXeapiPublicKeyRefreshing(), false)
    })
  })

  describe('reset', () => {
    it('清空 token 与 publicKey', () => {
      runtimeState.setAnonymousToken('TOKEN')
      runtimeState.setXeapiPublicKey({ publicKey: 'PK' })
      runtimeState.reset()
      assert.strictEqual(runtimeState.getAnonymousToken(), '')
      assert.strictEqual(runtimeState.getXeapiPublicKey(), null)
    })
  })
})

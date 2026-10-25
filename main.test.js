const assert = require('assert')
const main = require('./main')

describe('methods in server.js', () => {
  it('has serveNcmApi', () => {
    assert.strictEqual(typeof main.serveNcmApi, 'function')
  })

  it('has getModulesDefinitions', () => {
    assert.strictEqual(typeof main.getModulesDefinitions, 'function')
  })
})

describe('methods in module', () => {
  it('has activate_init_profile', () => {
    assert.strictEqual(typeof main.activate_init_profile, 'function')
  })
})

describe('runtimeState', () => {
  const runtimeState = require('./util/runtimeState')

  it('has generateConfig for bootstrapping in-memory credentials', () => {
    assert.strictEqual(typeof main.generateConfig, 'function')
  })

  it('exposes anonymousToken / xeapiPublicKey in memory', () => {
    assert.ok('anonymousToken' in runtimeState)
    assert.ok('xeapiPublicKey' in runtimeState)
  })

  describe('ensure()', () => {
    it('returns existing value without refreshing', async () => {
      runtimeState.ensureProbe = 'ready'
      let called = 0
      const value = await runtimeState.ensure('ensureProbe', async () => {
        called++
      })
      assert.strictEqual(value, 'ready')
      assert.strictEqual(called, 0)
      delete runtimeState.ensureProbe
    })

    it('refreshes when missing and shares one task among concurrent calls', async () => {
      let refreshes = 0
      const refresh = () =>
        new Promise((resolve) =>
          setTimeout(() => {
            refreshes++
            runtimeState.ensureProbe = 'fresh'
            resolve()
          }, 20),
        )
      const results = await Promise.all([
        runtimeState.ensure('ensureProbe', refresh),
        runtimeState.ensure('ensureProbe', refresh),
        runtimeState.ensure('ensureProbe', refresh),
      ])
      assert.deepStrictEqual(results, ['fresh', 'fresh', 'fresh'])
      assert.strictEqual(refreshes, 1)
      delete runtimeState.ensureProbe
    })

    it('propagates refresh failure and allows retry', async () => {
      let attempts = 0
      const fail = async () => {
        attempts++
        throw new Error('boom')
      }
      await assert.rejects(runtimeState.ensure('ensureProbe', fail), /boom/)
      assert.strictEqual(attempts, 1)
      // 失败后任务被清理，下一次调用会重试
      await assert.rejects(runtimeState.ensure('ensureProbe', fail), /boom/)
      assert.strictEqual(attempts, 2)
      delete runtimeState.ensureProbe
    })
  })
})

const assert = require('assert')
const voiceUpload = require('../module/voice_upload')

function createVoiceUploadHarness(uploadPlugin) {
  const requestCalls = []

  return {
    requestCalls,
    dependencies: {
      uploadPlugin,
      axios: async (options) => {
        if (options.method === 'post' && options.url.endsWith('?uploads')) {
          return {
            data: '<InitiateMultipartUploadResult><UploadId>upload-id</UploadId></InitiateMultipartUploadResult>',
          }
        }

        if (options.method === 'put') {
          return { headers: { etag: 'etag-1' } }
        }

        return { data: {} }
      },
    },
    request: async (uri, data, options) => {
      requestCalls.push({ uri, data, options })

      if (uri === '/api/nos/token/alloc') {
        return {
          body: {
            result: {
              objectKey: 'voice/audio.mp3',
              docId: 'audio-doc-id',
              token: 'nos-token',
            },
          },
        }
      }

      if (uri === '/api/voice/workbench/voice/batch/upload/v2') {
        return { body: { data: { voiceId: 'voice-id' } } }
      }

      return { body: { code: 200 } }
    },
  }
}

function createVoiceUploadQuery(overrides = {}) {
  const data = Buffer.from('audio')

  return {
    songFile: {
      name: 'episode.mp3',
      mimetype: 'audio/mpeg',
      size: data.length,
      data,
    },
    voiceListId: 'voice-list-id',
    categoryId: 'category-id',
    secondCategoryId: 'second-category-id',
    description: 'episode description',
    ...overrides,
  }
}

describe('voice upload cover', () => {
  it('uses the uploaded image as the cover for every voice submission', async () => {
    let uploadedQuery
    const harness = createVoiceUploadHarness(async (query) => {
      uploadedQuery = query
      return { imgId: 'uploaded-cover-id' }
    })
    const query = createVoiceUploadQuery({
      imgFile: {
        name: 'cover.jpg',
        mimetype: 'image/jpeg',
        data: Buffer.from('image'),
      },
      coverImgId: 'fallback-cover-id',
    })

    const result = await voiceUpload(
      query,
      harness.request,
      harness.dependencies,
    )
    const voiceCalls = harness.requestCalls.filter((call) =>
      call.uri.startsWith('/api/voice/workbench/voice/batch/upload'),
    )

    assert.strictEqual(uploadedQuery, query)
    assert.strictEqual(voiceCalls.length, 2)
    voiceCalls.forEach((call) => {
      const [voiceData] = JSON.parse(call.data.voiceData)
      assert.strictEqual(voiceData.coverImgId, 'uploaded-cover-id')
    })
    assert.deepStrictEqual(result, {
      status: 200,
      body: {
        code: 200,
        data: { voiceId: 'voice-id' },
      },
    })
  })

  it('keeps using coverImgId when no image file is uploaded', async () => {
    let uploaded = false
    const harness = createVoiceUploadHarness(async () => {
      uploaded = true
      return { imgId: 'unexpected-cover-id' }
    })

    await voiceUpload(
      createVoiceUploadQuery({ coverImgId: 'existing-cover-id' }),
      harness.request,
      harness.dependencies,
    )

    const voiceCalls = harness.requestCalls.filter((call) =>
      call.uri.startsWith('/api/voice/workbench/voice/batch/upload'),
    )
    assert.strictEqual(uploaded, false)
    voiceCalls.forEach((call) => {
      const [voiceData] = JSON.parse(call.data.voiceData)
      assert.strictEqual(voiceData.coverImgId, 'existing-cover-id')
    })
  })
})

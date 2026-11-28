/**
 * 新增功能使用的请求封装：统一错误结构，便于 UI 决定「提示 / 隐藏 / 重试」。
 */
;(function () {
  'use strict'

  const { api } = window.LT

  class ApiError extends Error {
    constructor(message, { code = 0, retryable = false, payload = null } = {}) {
      super(message || '请求失败')
      this.name = 'ApiError'
      this.code = code
      this.retryable = retryable
      this.payload = payload
    }
  }

  const URLS = {
    landing: '/listentogether/multi/landing/info',
    playedList: '/listentogether/multi/match/played/song/list',
    playedInfo: '/listentogether/multi/played/song/info',
    mutualFollows: '/listentogether/mutual/follows/get/v2',
    invite: '/listentogether/multi/invite',
    startMsg: '/listentogether/multi/start/msg',
    chatSend: '/listentogether/multi/chat/send',
    queueWait: '/listentogether/multi/match/wait/song/list',
    queueWaitSpecial: '/listentogether/multi/special/wait/song/list',
    chatHistory: '/listentogether/multi/match/msg/history',
    chatHistorySpecial: '/listentogether/multi/special/msg/history',
    songUrl: '/song/url/v1',
    lyric: '/lyric',
    search: '/search',
    songDetail: '/song/detail',
  }

  async function apiCall(url, data = {}, options = {}) {
    const { method = 'post', timeout } = options
    try {
      const res = await api({ url, method, data, timeout })
      const body = res.data || {}
      if (body.code !== 200) {
        throw new ApiError(body.message || `接口返回 ${body.code}`, {
          code: body.code,
          retryable: body.code === 429 || body.code >= 500,
          payload: body,
        })
      }
      return body
    } catch (error) {
      if (error instanceof ApiError) throw error
      const status = error.response?.status || 0
      throw new ApiError(
        error.response?.data?.message || error.message || '网络异常',
        {
          code: status,
          retryable: !status || status >= 500,
          payload: error.response?.data || null,
        },
      )
    }
  }

  async function safeApiCall(url, data = {}, options = {}) {
    try {
      return { ok: true, body: await apiCall(url, data, options) }
    } catch (error) {
      return { ok: false, error }
    }
  }

  window.LT.ApiError = ApiError
  window.LT.apiCall = apiCall
  window.LT.safeApiCall = safeApiCall
  window.LT.apiUrls = URLS
})()

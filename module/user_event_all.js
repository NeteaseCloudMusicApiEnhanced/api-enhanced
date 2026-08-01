// 获取当前登录用户可被上游枚举的全部动态

const userAccount = require('./user_account.js')
const userEvent = require('./user_event.js')

const PAGE_SIZE = 100
const MAX_PAGES = 1000

const errorResponse = (message, cookie = []) => ({
  status: 502,
  body: {
    code: 502,
    message,
  },
  cookie,
})

module.exports = async (query, request) => {
  const accountResult = await userAccount(query, request)
  const uid =
    accountResult.body?.account?.id || accountResult.body?.profile?.userId

  if (!uid) {
    if (
      accountResult.status !== 200 ||
      (accountResult.body?.code && accountResult.body.code !== 200)
    ) {
      return accountResult
    }

    return {
      status: 401,
      body: {
        code: 401,
        message: 'A valid login cookie is required',
      },
      cookie: accountResult.cookie || [],
    }
  }

  const cookies = [...(accountResult.cookie || [])]
  const events = []
  const eventIds = new Set()
  const cursors = new Set()
  let lasttime = -1
  let more = true
  let pageCount = 0
  let size = null

  while (more) {
    pageCount += 1

    const pageResult = await userEvent(
      {
        ...query,
        uid,
        lasttime,
        limit: PAGE_SIZE,
      },
      request,
    )

    cookies.push(...(pageResult.cookie || []))

    if (pageResult.status !== 200 || pageResult.body?.code !== 200) {
      return {
        ...pageResult,
        cookie: cookies,
      }
    }

    if (pageCount === 1) {
      const reportedSize = pageResult.body.size
      const numericSize = Number(reportedSize)
      size =
        reportedSize != null && Number.isFinite(numericSize)
          ? numericSize
          : null
    }

    for (const event of pageResult.body.events || []) {
      if (event?.id == null) {
        events.push(event)
        continue
      }

      const eventId = String(event.id)
      if (!eventIds.has(eventId)) {
        eventIds.add(eventId)
        events.push(event)
      }
    }

    more = Boolean(pageResult.body.more)
    lasttime = pageResult.body.lasttime

    if (more) {
      const cursor = String(lasttime ?? '')
      if (!cursor || cursors.has(cursor)) {
        return errorResponse(
          'Upstream event pagination cursor stalled',
          cookies,
        )
      }
      cursors.add(cursor)
    }

    if (more && pageCount >= MAX_PAGES) {
      return errorResponse(
        `Upstream event pagination exceeded ${MAX_PAGES} pages`,
        cookies,
      )
    }
  }

  const retrievedCount = events.length
  const unavailableCount =
    size == null ? null : Math.max(size - retrievedCount, 0)

  return {
    status: 200,
    body: {
      code: 200,
      events,
      size,
      retrievedCount,
      unavailableCount,
      sizeMismatch: size == null ? null : size !== retrievedCount,
      pageCount,
      more: false,
      lasttime: lasttime ?? null,
    },
    cookie: cookies,
  }
}

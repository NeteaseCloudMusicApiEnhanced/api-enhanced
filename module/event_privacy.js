// 修改本人动态的可见权限

const createOption = require('../util/option.js')

const PRIVACY_VALUES = new Set([0, 1, 2, 6])

module.exports = (query, request) => {
  const eventId = String(query.evId ?? '').trim()
  const rawPrivacy = String(query.privacy ?? '').trim()
  const privacy = Number(rawPrivacy)

  if (
    !eventId ||
    !rawPrivacy ||
    !Number.isInteger(privacy) ||
    !PRIVACY_VALUES.has(privacy)
  ) {
    return Promise.resolve({
      status: 400,
      body: {
        code: 400,
        message: 'evId is required and privacy must be one of 0, 1, 2, 6',
      },
      cookie: [],
    })
  }

  const data = {
    eventId,
    privacy,
  }

  return request(`/api/event/privacy/op`, data, createOption(query))
}

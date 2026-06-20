// 获取游客cookie

const CryptoJS = require('crypto-js')
const path = require('path')
const fs = require('fs')
const ID_XOR_KEY_1 = '3go8&$8*3*3h0k(2)2'
const logger = require('../util/logger.js')

const createOption = require('../util/option.js')
const { generateDeviceId } = require('../util/index')

// function getRandomFromList(list) {
//   return list[Math.floor(Math.random() * list.length)]
// }
function cloudmusic_dll_encode_id(some_id) {
  let xoredString = ''
  for (let i = 0; i < some_id.length; i++) {
    const charCode =
      some_id.charCodeAt(i) ^ ID_XOR_KEY_1.charCodeAt(i % ID_XOR_KEY_1.length)
    xoredString += String.fromCharCode(charCode)
  }
  const wordArray = CryptoJS.enc.Utf8.parse(xoredString)
  const digest = CryptoJS.MD5(wordArray)
  return CryptoJS.enc.Base64.stringify(digest)
}

module.exports = async (query, request) => {
  const deviceId = generateDeviceId()
  logger.info(`Successfully registered anonimous token, deviceId: ${deviceId}`)
  global.deviceId = deviceId
  const encodedId = CryptoJS.enc.Base64.stringify(
    CryptoJS.enc.Utf8.parse(
      `${deviceId} ${cloudmusic_dll_encode_id(deviceId)}`,
    ),
  )
  const data = {
    username: encodedId,
  }
  let result = await request(
    `/api/register/anonimous`,
    data,
    createOption(query, 'xeapi'),
  )
  if (result.body.code === 200) {
    result = {
      status: 200,
      body: {
        ...result.body,
        cookie: result.cookie.join(';'),
      },
      cookie: result.cookie,
    }
  }
  return result
}

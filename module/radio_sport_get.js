// 跑步漫游

const createOption = require('../util/option.js')
module.exports = (query, request) => {
  const data = {
    bpm: query.bpm || 50,
  }
  return request(`/api/radio/sport/get`, data, createOption(query))
}

// 获取指定维度音乐排行榜列表

const createOption = require('../util/option.js')
module.exports = (query, request) => {
  const data = {
    chartCode: query.chartCode,
    targetId: query.targetId,
    targetType: query.targetType,
  }
  return request(`/api/chart/song/detail`, data, createOption(query))
}

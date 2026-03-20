const createOption = require("../../../../util/option.js");

module.exports = (query, request) => {
  const data = {
    keyword: query.keyword,
    scene: "normal",      // 暂时不知道还有啥 scene，先写死为 normal
    limit: query.limit || 10,
    offset: query.offset || 0,
    needCorrect: query.needCorrect || true,
    channel: "typing"     // 暂时不知道还有啥 channel，先写死为 typing
  }

  return request(
    "/api/search/song/list/page",
    data,
    createOption(query, "weapi")
  )
}

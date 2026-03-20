const createOption = require("../../../../util/option.js");

module.exports = (query, request) => {
  const data = {
    s: query.s,
    limit: query.limit || 10,
    offset: query.offset || 0,
    queryCorrect: query.queryCorrect || true,
  }

  return request(
    "/api/v1/search/artist/get",
    data,
    createOption(query, "weapi")
  )
}

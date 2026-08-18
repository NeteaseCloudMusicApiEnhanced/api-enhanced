// 歌曲百科

const createOption = require('../util/option.js')
module.exports = (query, request) => {
  const extJson = {
    states: {
      playingResource: {
        current: query.id,
        scene: 'songWiki',
      },
    },
  }
  const data = {
    extJson: JSON.stringify(extJson),
    positionCode: 'songWikiMainPosition',
  }
  return request(
    `/api/link/page/parent/relation/construct/info`,
    data,
    createOption(query, 'eapi'),
  )
}

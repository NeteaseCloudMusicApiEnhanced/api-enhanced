import { createState } from './js/state.js'
import { computed } from './js/computed.js'
import { mounted } from './js/mounted.js'
import { commonMethods } from './js/methods/common.js'
import { roomMethods } from './js/methods/room.js'
import { matchMethods } from './js/methods/match.js'
import { stickersMethods } from './js/methods/stickers.js'
import { songsMethods } from './js/methods/songs.js'

const { createApp } = Vue

createApp({
  data: createState,
  computed,
  mounted,
  methods: {
    ...commonMethods,
    ...roomMethods,
    ...matchMethods,
    ...stickersMethods,
    ...songsMethods,
  },
}).mount('#app')

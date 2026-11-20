(function () {
  const {
    createState,
    computed,
    mounted,
    commonMethods,
    roomMethods,
    matchMethods,
    stickersMethods,
    songsMethods,
  } = window.LT
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
})()

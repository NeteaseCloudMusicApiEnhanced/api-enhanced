# 多人一起听 Demo

`/listen_together_multi/` 是多人一起听的控制台 Demo。页面结构、样式和逻辑已经拆开，方便单独维护。

布局采用顶部状态栏 + 成员/播放/聊天三栏工作区，灵感来自现代 Web 音乐控制台；数据来源和业务逻辑仍完全走 api-enhanced 的多人一起听接口，与独立的 PluvIIter/MusicParty 项目无关。


```text
index.html                 页面模板（Vue 模板 + 顶栏 + 三栏工作区）
style.css                  页面样式（应用外壳、三栏布局、表情/歌曲选择器）
app.js                     入口：组合 state / computed / methods 并挂载 Vue
js/core.js                 axios 实例、请求拦截、常量、localStorage 封装
js/state.js                初始 data
js/computed.js             房型标签、分享链接、表情合并等 computed
js/mounted.js              页面挂载后的初始化
js/stickers.js             内置一起听表情、本地表情读取
js/methods/common.js       通用工具、复制、刷新
js/methods/room.js         登录/房间状态/轮询/聊天/播放同步
js/methods/match.js        SSE 匹配、NIM 聊天室成员
js/methods/stickers.js     表情发送、收藏、云表情分页
js/methods/songs.js        歌曲搜索、加歌/切歌/点赞、音频加载
```

## 关键接口

- 匹配：`/listentogether/multi/match` + SSE `/listentogether/multi/match/events`
- 状态：`/listentogether/multi/match/status/get`
- 加歌：`/listentogether/multi/match/song/operate`
- 表情：`/social/emoji/groups`、`/social/emoji/groups/detail/page`、`/social/emoji/collect`
- 聊天室：`/listentogether/multi/chat/send`

## 调试

旧路径 `/listen_together_multi.html` 会重定向到这里。页面需要登录态；服务端可以用浏览器 Cookie 或 `NETEASE_COOKIE`。

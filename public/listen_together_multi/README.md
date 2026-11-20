# 多人一起听 Demo

`/listen_together_multi/` 是多人一起听的控制台 Demo。页面结构、样式和逻辑已经拆开，方便单独维护。

页面使用 **classic script + `window.LT` 命名空间**，而不是 ES module。这样即使部署环境用 Babel/esbuild 把 JS 转成 CommonJS，也不会出现 `require is not defined`；脚本按 index.html 里的顺序加载即可。

布局采用顶部状态栏 + 左侧成员 + 中间播放/队列的工作区，顶栏滚动时吸顶，主色为网易红。顶栏右侧有「＋ 添加歌曲」按钮，打开添加歌曲弹窗（桌面普通弹窗，移动端全屏）；输入框支持粘贴网易云/163cn.tv 歌曲链接，解析出 songId 后展示歌曲，解析失败自动 fallback 到关键词搜索。当前播放区域重写成竖直排列的播放条：封面+歌曲信息、播放/进度、音量/音质/切歌/点赞/喜欢分三行；移动端保持同样的竖向结构但更紧凑。原生 audio 控件已移除，歌名和歌手过长时使用走马灯，SongID、BizID、进度合并为一行。切换音质时会保留播放状态，避免暂停/播放图标闪动。

聊天不再硬塞进三栏：桌面端有一个 **58px 的固定方形聊天按钮**，可拖动并记住位置，有未读数时直接显示数字；移动端聊天按钮放在顶栏、紧挨添加歌曲按钮。聊天按钮在气泡打开后仍然显示，再点一次可关闭；桌面端气泡没有蒙层、贴着按钮定位，移动端全屏，内部有「聊天 / 工作日志」两个选项卡。自定义表情列表滚动到底部会自动加载下一页。房间分享链接输入框占满整行，支持直接粘贴 `163cn.tv` 短链接自动解析；同时可以复制当前播放歌曲的网易云链接。数据来源和业务逻辑仍完全走 api-enhanced 的多人一起听接口，与独立的 PluvIIter/MusicParty 项目无关。


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
js/methods/match.js        SSE 匹配、NIM 聊天室成员、刷新后重新连接
js/methods/stickers.js     表情发送、收藏、云表情分页
js/methods/songs.js        歌曲搜索、加歌/切歌/点赞、音频加载
```

## 关键接口

- 匹配：`/listentogether/multi/match` + SSE `/listentogether/multi/match/events`
- 状态：`/listentogether/multi/match/status/get`
- 加歌：`/listentogether/multi/match/song/operate`
- 表情：`/social/emoji/groups`、`/social/emoji/groups/detail/page`、`/social/emoji/collect`
- 聊天室：`/listentogether/multi/chat/send`
- 分享链接解析：`/share/resolve`（支持 163cn.tv 短链接）

## 调试

旧路径 `/listen_together_multi.html` 会重定向到这里。页面需要登录态；服务端可以用浏览器 Cookie 或 `NETEASE_COOKIE`。

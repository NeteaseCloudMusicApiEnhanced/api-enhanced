# Webpack Bundle 使用说明

本项目已配置为使用 Webpack 构建单文件 bundle，放置在 `./precompiled` 目录下。

## 构建命令

```bash
# 开发模式构建
npm run build:dev

# 生产模式构建（默认）
npm run build
# 或
npm run build:prod
```

## 注意事项

由于本项目使用了动态模块加载（特别是 `./module` 目录下的 API 模块），完全的单文件打包会有一些限制：

1. Webpack 生成的 bundle 文件 (`precompiled/bundle.js`) 依赖于项目根目录的 `module` 文件夹来动态加载 API 模块
2. 因此，部署时需要同时包含 `bundle.js` 和 `module` 文件夹
3. 完整的部署结构应如下：
   ```
   project/
   ├── precompiled/
   │   └── bundle.js
   ├── module/
   │   ├── album_detail.js
   │   ├── artist_album.js
   │   └── ... (所有API模块文件)
   ├── node_modules/
   └── ... (其他依赖文件夹)
   ```

## 运行

```bash
node precompiled/bundle.js
```

## 替代方案

如果您需要真正的单文件部署，可以考虑使用项目中已有的 pkg 配置：
```bash
npm run pkgwin    # Windows
npm run pkglinux  # Linux
npm run pkgmacos  # macOS
```

这些命令会创建真正的单文件可执行程序，其中包含了所有必要的依赖。
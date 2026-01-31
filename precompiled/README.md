# Webpack Bundle 使用说明

本项目已配置为使用 Webpack 构建 bundle，放置在 `./precompiled` 目录下。

## 构建命令

```bash
# 开发模式构建
npm run build:dev

# 生产模式构建（默认）
npm run build
# 或
npm run build:prod
```

## 重要说明

由于本项目设计上使用了动态模块加载（特别是 `./module` 目录下的 API 模块），使用 Webpack 打包存在技术限制：

1. **当前限制**：项目中的动态 require 语句（如 `require(filePath)`，其中 filePath 是变量）在 Webpack 打包时难以完全处理。
2. **部署要求**：要运行 `precompiled/bundle.js`，必须保持原始项目结构，包括 `module`、`util` 等文件夹。
3. **推荐方案**：对于真正的单文件部署，建议使用项目自带的 pkg 配置：
   ```bash
   npm run pkgwin    # Windows
   npm run pkglinux  # Linux
   npm run pkgmacos  # macOS
   ```

## 完整部署结构

如果要使用 Webpack bundle，需要保留的文件夹：
```
project/
├── precompiled/
│   └── bundle.js
├── module/              # API 模块
├── util/                # 工具函数
├── public/              # 静态资源
├── data/                # 数据文件
├── node_modules/        # 依赖包
└── ... (其他文件夹)
```

## 运行（需要完整项目结构）

```bash
node precompiled/bundle.js
```

## 推荐的部署方式

对于生产环境，我们推荐使用 pkg 构建的单文件：
```bash
npm run pkgwin
# 生成的可执行文件位于 bin/app.exe
```

这种方式会创建完全自包含的可执行文件，不需要额外的模块文件夹。
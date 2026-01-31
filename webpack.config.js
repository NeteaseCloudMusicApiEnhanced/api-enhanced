const path = require('path');

module.exports = {
  entry: './app.js',
  target: 'node',
  output: {
    path: path.resolve(__dirname, 'precompiled'),
    filename: 'bundle.js',
    libraryTarget: 'commonjs2',
  },
  resolve: {
    extensions: ['.js', '.json'],
  },
  // 排除所有node_modules中的依赖，因为它们在运行时会被require
  externals: [
    // 项目依赖的所有外部模块
    'express',
    'fs',
    'path',
    'os',
    'child_process',
    'crypto-js',
    'dotenv',
    'express-fileupload',
    'md5',
    'music-metadata',
    'node-forge',
    'pac-proxy-agent',
    'qrcode',
    'safe-decode-uri-component',
    'tunnel',
    'xml2js',
    'yargs',
    'axios',
    '@neteasecloudmusicapienhanced/unblockmusic-utils',
    /\.node$/, // 排除.node文件
  ],
  module: {
    rules: [
      {
        test: /\.js$/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env'],
          },
        },
        exclude: /node_modules/,
      },
    ],
  },
  mode: 'production',
  optimization: {
    minimize: true,
  },
  stats: {
    errorDetails: true
  },
  // 为动态模块提供上下文
  plugins: [
    new (require('webpack')).ContextReplacementPlugin(
      /util[\/\\]request/, // 针对request模块路径
      path.resolve(__dirname)
    )
  ],
  // 避免对Node.js内置模块的警告
  node: {
    __dirname: false,
    __filename: false,
  }
};
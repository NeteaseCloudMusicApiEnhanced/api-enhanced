import fs from 'fs';
import path from 'path';

/**
 * 递归获取所有路由文件并生成前缀
 * @param dir 当前扫描的目录
 * @param basePrefix 累积的 URL 前缀
 */
export function loadModules(dir: string, basePrefix = '/') {
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      // 检查是否是路由组 (group)
      const isGroup = file.startsWith('(') && file.endsWith(')');
      const nextPrefix = isGroup
        ? basePrefix
        : path.join(basePrefix, file);

      // 递归处理子目录
      loadModules(fullPath, nextPrefix);
    } else if (file.endsWith('.ts') || file.endsWith('.js')) {
      // 处理文件
      const fileName = path.parse(file).name;

      // 兼容原有的下划线逻辑
      // 比如 file 为 "user_info.ts", basePrefix 为 "/v1"
      // 结果为 /v1/user/info
      const fileRoutePath = fileName.split('_').join('/');
      const finalRoute = path.join(basePrefix, fileRoutePath).replace(/\\/g, '/');

      console.log(`绑定路由: ${finalRoute} -> 来自文件: ${fullPath}`);

      // 在这里执行你原有的 register 逻辑
      // register(finalRoute, require(fullPath));
    }
  }
}

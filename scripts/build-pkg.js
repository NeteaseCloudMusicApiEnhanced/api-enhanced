/**
 * Invoke the pkg packager (cross-platform, independent of node_modules layout).
 *
 * Background: on Windows, pnpm links node_modules/@yao-pkg/pkg to
 * node_modules/.pnpm/@yao-pkg+pkg@<ver>/node_modules/@yao-pkg/pkg via a junction.
 * Some CI environments (pnpm 11 + Windows runner) may fail to create that link,
 * so executing node_modules/@yao-pkg/pkg/lib-es5/bin.js directly throws
 * MODULE_NOT_FOUND.
 *
 * This script first resolves pkg via require.resolve and falls back to
 * scanning the .pnpm physical directory, so pkg is found whether the
 * junction exists or not.
 */
const { spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')

function resolvePkgBin() {
  try {
    return require.resolve('@yao-pkg/pkg/lib-es5/bin.js')
  } catch (err) {
    // require.resolve failed (e.g. missing node_modules/@yao-pkg/pkg link): scan .pnpm
    const pnpmDir = path.join(process.cwd(), 'node_modules', '.pnpm')
    if (fs.existsSync(pnpmDir)) {
      const candidates = fs
        .readdirSync(pnpmDir)
        .filter((dir) => dir.startsWith('@yao-pkg+pkg@'))
        .map((dir) =>
          path.join(
            pnpmDir,
            dir,
            'node_modules',
            '@yao-pkg',
            'pkg',
            'lib-es5',
            'bin.js',
          ),
        )
        .filter((file) => fs.existsSync(file))
      if (candidates.length) {
        return candidates[0]
      }
    }
    return null
  }
}

const bin = resolvePkgBin()
if (!bin) {
  console.error(
    '[build-pkg] pkg executable not found; run `pnpm install --frozen-lockfile` first',
  )
  process.exit(1)
}

const result = spawnSync(process.execPath, [bin, ...process.argv.slice(2)], {
  stdio: 'inherit',
})
process.exit(result.status === null ? 1 : result.status)

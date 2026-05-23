# AGENTS.md — api-enhanced

**`@neteasecloudmusicapienhanced/api`** (v4.33.0) — Enhanced fork of Binaryify/NeteaseCloudMusicApi. ~250+ dynamically loaded Netease Cloud Music REST API endpoints.

---

## Entrypoints

| Use case | File | Notes |
|----------|------|-------|
| CLI/server | `app.js` | Auto-generates anonymous token, then calls `server.serveNcmApi()` |
| Programmatic | `main.js` | Dynamically loads all `module/*.js` as functions, plus re-exports `server.js` |
| Express app | `server.js` | Exports `serveNcmApi(options)` and `getModulesDefinitions(path, routeOverrides)` |
| Vercel | `index.js` | `require('./app.js')` |
| ESM | `index.mjs` | `import './app.js'` |

## Dev commands

```sh
npm run dev          # nodemon app.js
npm start            # node app.js
npm test             # mocha -r intelli-espower-loader -t 60000 server.test.js main.test.js --exit
npm run lint         # eslint "**/*.{js,ts}"
npm run lint-fix     # eslint --fix "**/*.{js,ts}"
npm run prepare      # husky install (auto on pnpm install)
npm run pkgwin       # pkg . -t node18-win-x64 -C GZip -o precompiled/app
npm run pkglinux     # pkg . -t node18-linux-x64 -C GZip -o precompiled/app
npm run pkgmacos     # pkg . -t node18-macos-x64 -C GZip -o precompiled/app
```

**Must-use order when making changes:** `lint-fix → test` (test runs server integration, not just unit).

## Testing quirks

- **Mocha 11** + power-assert. 60s timeout. `--exit` is required (server keeps event loop alive).
- **Server bootstraps in `server.test.js`** — starts Express on a random port before all tests, then dynamically `require()`s all `test/*.test.js` files.
- Tests use `global.host` (dynamic port) or fallback to `http://localhost:3000`.
- **`realIP: global.cnIp`** is sent with every request to avoid Netease rate limiting. `global.cnIp` is a random Chinese IP from `data/china_ip_ranges.txt`.
- Hardcoded song/album IDs in test files may fail if Netease's catalog changes.
- Anonymous token is auto-generated to `os.tmpdir()/anonymous_token` before tests run.
- Tests are **integration tests** requiring live access to `music.163.com` — they will fail offline.

## Architecture

**Dynamic routing** — each `.js` in `module/` becomes an API route:
- `album_new.js` → `GET /album/new`
- Underscores become slashes. Three overrides exist in `server.js`:
  - `daily_signin.js` → `/daily_signin`
  - `fm_trash.js` → `/fm_trash`
  - `personal_fm.js` → `/personal_fm`

**Encryption** (see `util/crypto.js`):
- `weapi` — AES-CBC + RSA (most endpoints)
- `linuxapi` — AES-ECB (linux client endpoints)
- `eapi` — custom (newer endpoints)
- `api` — plaintext (rare)

**API domains** — `music.163.com` (weapi/linuxapi), `interface.music.163.com` (eapi/api).

**Cache** — 2-minute TTL via `util/apicache.js` on all responses. Bypass with `?cache=false`.

**Anonymous token** — auto-generated at startup via `generateConfig.js` → `register_anonimous()`, cached at `os.tmpdir()/anonymous_token`. Deletion forces regeneration on next start.

**Unblock feature** — set `ENABLE_GENERAL_UNBLOCK=true` in `.env` to activate `@neteasecloudmusicapienhanced/unblockmusic-utils` for `/song/url/v1`.

## Config & style

| Tool | Setting |
|------|---------|
| ESLint | **Flat config**`eslint.config.js` — extends prettier, 2-space indent, single quotes, no semicolons |
| Prettier | `semi: false`, `singleQuote: true`, `trailingComma: "all"` |
| EditorConfig | LF endings, 2-space indent for `*.{js,ts}` |
| TypeScript | `tsconfig.json` — `strict: true`, `noEmit: true` (type-check only), path aliases `~/*` and `@/*` |
| Husky v9 | Pre-commit: lint-staged (`*.js` → `eslint --fix`). Commit-msg & pre-push: placeholder shims. |

## CI/CD workflows (`.github/workflows/`)

| Workflow | Trigger | What it does |
|----------|---------|-------------|
| `npm.yml` | release published | Publishes to npm |
| `release-on-version-change.yml` | push to main changing `package.json` | Builds binaries + creates GitHub Release |
| `Build_Image.yml` | release published | Builds & pushes Docker images to Docker Hub + GHCR |
| `build-and-pr.yml` | manual + push to main | Builds binaries (linux/win/macos) |
| `sync.yml` | daily schedule | Syncs fork with upstream Binaryify repo |
| `issue-manage.yml` | issue open/comment | Welcome / stale management |

## Operational gotchas

- **pnpm** lockfile (`pnpm-lock.yaml`). Never commit `package-lock.json`.
- **Express v5** — verify v4→v5 migration quirks (route param handling, error middleware).
- **No database** — this is a stateless API proxy. Persistent state is only `os.tmpdir()/anonymous_token`.
- **`.env` is gitignored** — copy `.env.prod.example` for local config.
- **`data/china_ip_ranges.txt`** — used for `realIP` spoofing to bypass Netease geo-restrictions.
- **`data/deviceid.txt`** — pre-generated device IDs for API requests.
- **Docker**: `node:lts-alpine`, runs via `tini`, only includes `module/plugins/public/util/app.js/server.js`.
- **Vercel**: `@vercel/node` runtime with CORS headers in `vercel.json`.
- **Precompiled binaries** via `pkg` — output to `precompiled/` (gitignored). Node 18 target pinned in scripts.
- **Do not** modify files in `public/` — it's excluded from ESLint (`globalIgnores(['**/public/'])`).

## Codebase structure (key dirs)

```
module/      → 392 endpoint handlers (one .js per route)
util/        → crypto, request (HTTP + encryption), cache, logger, config
plugins/     → image & song upload handlers
test/        → 5 integration test files (album, comment, lyric, music_url, search)
data/        → china_ip_ranges.txt, deviceid.txt (static assets)
public/      → docs site (Docsify), test pages (ESLint-ignored)
examples/    → usage examples (moddef.json gitignored)
.github/     → workflows, issue templates, dependabot, funding
```

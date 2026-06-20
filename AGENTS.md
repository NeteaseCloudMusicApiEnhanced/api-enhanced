# Agent Instructions for NeteaseCloudMusicApiEnhanced

## Quick Start
- **Package Manager**: Use `pnpm` (not npm or yarn).
- **Node Version**: Requires Node.js 18 or later.

## Developer Commands
- **Install dependencies**: `pnpm i`
- **Start server**: `pnpm start` or `node app.js`
- **Start dev server**: `pnpm dev` (uses nodemon)
- **Run tests**: `pnpm test` (uses Mocha)
- **Linting**: `pnpm lint` (check) or `pnpm lint-fix` (auto-fix)

## Architecture & Entrypoints
- **Executable Server**: `app.js` is the main entrypoint for running the API server.
- **Module Exports**: `main.js` is the entrypoint when the project is imported as a Node.js dependency.
- **API Endpoints**: Located in the `module/` directory. Each file typically corresponds to an API route.
- **Core Utilities**: Request handling, encryption, and core utilities are found in the `util/` directory.

## Important Gotchas & Quirks
- **Environment Variables**: The server defaults to port 3000 but can be overridden with the `PORT` environment variable.
- **Proxy Variables**: Be very careful with proxy environment variables (`http_proxy`, `https_proxy`, `no_proxy`). The request library (like axios) will automatically pick these up. If they point to an unavailable proxy (especially common in Docker environments), requests will fail silently or throw connection errors.
- **Code Style**: The project uses ESLint and Prettier. Always run `pnpm lint-fix` before committing changes to ensure formatting consistency.

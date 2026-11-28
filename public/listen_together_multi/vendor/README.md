# Vendored browser dependencies

These files are served from the same origin so the demo can start through
Cloudflare/browser caches without a cross-origin CDN round-trip. `js/boot.js`
still falls back to jsDelivr/unpkg if a file is missing or corrupted.

| File | Package | Version | License |
| --- | --- | --- | --- |
| `vue.global.prod.js` | [vue](https://www.npmjs.com/package/vue) | 3.5.46 | MIT |
| `axios.min.js` | [axios](https://www.npmjs.com/package/axios) | 0.26.1 | MIT |

When upgrading, update both the file and the version in `js/boot.js`, then bump
`VERSION` in `boot.js` and every `?v=` in `index.html`.

# Link Previews

Self-contained Obsidian link previews: OpenGraph cards everywhere and durable static webpage screenshots captured inside Obsidian Desktop.

## Behavior

- HTTP(S) links render an OpenGraph card using Obsidian's `requestUrl` API. Metadata parsing tolerates attribute order, quote styles, HTML entities, relative images, and `<title>` fallback.
- **Desktop:** when a note opens/renders, each HTTP(S) link immediately gets an OpenGraph card while a missing or stale screenshot is captured in a hidden Electron `BrowserWindow`. A successful capture is persisted as a PNG plus a normal Markdown image/marker and replaces the fallback card. Existing fresh screenshots render immediately and are not recaptured. The commands remain available for manual enrichment/refresh.
- **Mobile:** screenshot capture is never attempted. Persisted vault screenshots render offline; otherwise the OpenGraph card is used.
- No helper process, local server, Node installation, configurable endpoint, iframe, telemetry, cookies, or login state is required.

## Limitations and failure behavior

Capture is desktop-only and depends on Obsidian exposing a compatible Electron `BrowserWindow`/`capturePage` runtime. If that API is unavailable, navigation fails, or the page cannot load, the plugin shows a notice and leaves the original link and OpenGraph fallback intact. This is not universal webpage rendering support. Pages requiring authentication, unusual browser APIs, or blocking automation may not capture correctly.

Screenshots are generated automatically on desktop note render when missing or stale. The refresh interval is configurable in settings (zero disables automatic refresh). Review remote pages before capturing them; the hidden window uses Node integration disabled and context isolation enabled.

## Development

```sh
npm install
npm run lint
npm run build
npm test
```

`main.js` is the committed installable bundle. Releases include `manifest.json`, `main.js`, and `styles.css`.

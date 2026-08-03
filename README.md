# Link Previews

An Obsidian plugin that renders OpenGraph cards for HTTP(S) links and stores durable webpage screenshots in the vault.

## Behavior

- OpenGraph metadata is fetched through Obsidian's `requestUrl` API. Parsing tolerates common meta attribute orders, quote styles, HTML entities, relative images, and title fallback.
- **Desktop:** run **Enrich URL with webpage screenshot** with the cursor on a URL. The plugin calls the optional configured helper and stores the PNG plus a Markdown image/marker in the vault.
- **Mobile:** screenshot generation is never attempted. Existing vault images render offline; otherwise the OpenGraph card is used.
- No iframe, telemetry, cookies, or login state is used.

## Screenshot helper

The plugin does **not** start the helper automatically. Start it separately:

```sh
cd helper && npm install && npx playwright install chromium && npm start
```

It listens on `127.0.0.1:8765`, provides `GET /health`, and accepts `POST /screenshot` with `{ "url": "https://example.com" }`. It blocks private targets and unsafe redirects. Configure the endpoint in **Settings → Link Previews**, then run **Test screenshot helper connection**. If unavailable, screenshot enrichment shows an actionable notice and OpenGraph cards continue to work.

## Development

```sh
npm install
npm run lint
npm run build
npm test
```

The generated `main.js` is the installable plugin bundle and is intentionally committed.

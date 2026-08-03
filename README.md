# Link Previews

An Obsidian plugin that turns external links into privacy-conscious OpenGraph cards and durable static webpage screenshots.

## Behavior

- OpenGraph metadata is fetched through Obsidian's request API and displayed as a card.
- **Desktop:** run `Enrich URL with webpage screenshot` with the cursor on a URL. The plugin calls a configurable local helper and stores the PNG plus a machine-readable HTML marker in the vault.
- **Mobile:** screenshot generation is never attempted. Existing vault images render offline; otherwise the OpenGraph card is used.
- No iframes, telemetry, cookies, or login state are used.

## Screenshot helper

The plugin does not launch Chromium. A minimal optional helper is in `helper/`:

```sh
cd helper && npm install && npx playwright install chromium && npm start
```

It listens on `127.0.0.1:8765` and accepts `POST /screenshot` with `{ "url": "https://example.com" }`. It blocks non-HTTP(S), loopback, private/link-local/reserved IPs, redirects to unsafe targets, downloads, and persistent browser state. Review the helper before exposing it beyond localhost.

Configure the endpoint in **Settings → Link Previews**. If unavailable, the plugin keeps the original link and OpenGraph fallback intact.

## Development

```sh
npm install
npm run lint
npm run build
npm test
```

The generated `main.js` is the installable plugin bundle and is intentionally committed for Obsidian's normal plugin loading workflow.

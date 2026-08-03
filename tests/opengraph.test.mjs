import test from 'node:test';
import assert from 'node:assert/strict';
import { parseOpenGraph } from '../.test-dist/opengraph.mjs';

test('parses OpenGraph regardless of attribute order and quoting', () => {
  const html = `<title>Fallback</title><meta content='A &amp; B' property='og:description'><meta name="og:title" content="Example"><meta property="og:image" content="/cover.png">`;
  assert.deepEqual(parseOpenGraph(html, 'https://example.test/page'), { title: 'Example', description: 'A & B', image: 'https://example.test/cover.png' });
});
test('falls back to title and source URL', () => {
  assert.equal(parseOpenGraph('<title>Hello &amp; world</title>', 'https://example.test').title, 'Hello & world');
  assert.equal(parseOpenGraph('', 'https://example.test').title, 'https://example.test');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('registers a Live Preview editor extension for bare HTTP(S) links', async () => {
  const source = await readFile(new URL('../src/main.ts', import.meta.url), 'utf8');
  assert.match(source, /observeLivePreviewEditors/);
  assert.match(source, /querySelectorAll\('\.cm-line'\)/);
  assert.match(source, /link-preview-live/);

  const built = await readFile(new URL('../main.js', import.meta.url), 'utf8');
  assert.doesNotMatch(built, /@codemirror\/(state|view)/);
  assert.doesNotMatch(built, /require\(['"]@codemirror\//);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('registers a Live Preview editor extension for bare HTTP(S) links', async () => {
  const source = await readFile(new URL('../src/main.ts', import.meta.url), 'utf8');
  assert.match(source, /registerEditorExtension\(ViewPlugin\.fromClass/);
  assert.match(source, /const re = \/https\?:\\\/\\\/\[\^\\s\)>\]\+\/gi/);
  assert.match(source, /Decoration\.widget/);
});

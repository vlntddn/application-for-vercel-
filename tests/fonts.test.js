import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveFile } from '../server/static.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');

function fakeRes() {
  return { status: 0, headers: {}, writeHead(s, h) { this.status = s; this.headers = h; }, end() {} };
}

test('every @font-face file exists, is cached offline and served as font/woff2', async () => {
  const css = fs.readFileSync(path.join(PUBLIC, 'styles.css'), 'utf8');
  const sw = fs.readFileSync(path.join(PUBLIC, 'sw.js'), 'utf8');
  const urls = [...css.matchAll(/url\("(\/fonts\/[^"]+\.woff2)"\)/g)].map((m) => m[1]);
  assert.ok(urls.length >= 5, 'Onest (3 subsets) + IBM Plex Mono (2 weights) are declared');
  for (const u of urls) {
    assert.ok(fs.existsSync(path.join(PUBLIC, u)), `${u} is bundled`);
    assert.ok(sw.includes(`'${u}'`), `${u} is in the service worker SHELL`);
    const res = fakeRes();
    await serveFile(res, PUBLIC, u);
    assert.equal(res.status, 200);
    assert.equal(res.headers['Content-Type'], 'font/woff2');
  }
});

test('font licences ship next to the fonts and are served as text', async () => {
  for (const f of ['OFL-Onest.txt', 'OFL-IBMPlexMono.txt']) {
    const text = fs.readFileSync(path.join(PUBLIC, 'fonts', f), 'utf8');
    assert.match(text, /SIL Open Font License, Version 1\.1/);
    const res = fakeRes();
    await serveFile(res, PUBLIC, `/fonts/${f}`);
    assert.equal(res.headers['Content-Type'], 'text/plain; charset=utf-8');
  }
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeOverlayIndex } from '../scripts/gen-data-index.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const KINDS = ['translations', 'explanations'];

function readIndex(dir) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'data', dir, 'index.json'), 'utf8'));
}

function actualFiles(dir) {
  return fs
    .readdirSync(path.join(ROOT, 'data', dir), { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.json') && e.name !== 'index.json')
    .map((e) => e.name)
    .sort();
}

for (const dir of KINDS) {
  test(`${dir}: index.json matches the overlay files on disk`, () => {
    const listed = readIndex(dir);
    assert.ok(Array.isArray(listed), `${dir}/index.json must be a JSON array`);
    assert.deepStrictEqual(listed, actualFiles(dir), `${dir}/index.json drifted from the directory`);
  });

  test(`${dir}: every listed slug is a valid overlay basename`, () => {
    const listed = readIndex(dir);
    for (const name of listed) {
      assert.match(name, /^[a-z0-9][a-z0-9-]*\.json$/, `${dir}/index.json has odd name ${name}`);
    }
  });
}

test('index covers the existing translation overlays (22 slugs are not listed)', () => {
  const listed = readIndex('translations');
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/manifest.json'), 'utf8'));
  const allSlugs = manifest.categories.map((c) => c.slug);
  // The bank has 25 categories; only the ones with a real overlay file appear.
  assert.ok(allSlugs.length >= 25, 'manifest should list 25 categories');
  for (const name of listed) {
    const slug = name.replace(/\.json$/, '');
    assert.ok(allSlugs.includes(slug), `listed translation ${slug} is not a manifest slug`);
  }
  // The whole point of Q2: NOT every slug is listed, so the client skips the rest.
  assert.ok(listed.length < allSlugs.length, 'index must be a subset of the 25 slugs');
});

test('writeOverlayIndex is idempotent and correct (temp dir)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-idx-'));
  try {
    fs.writeFileSync(path.join(tmp, 'b.json'), '{}');
    fs.writeFileSync(path.join(tmp, 'a.json'), '{}');
    fs.writeFileSync(path.join(tmp, 'index.json'), 'stale');

    let written = writeOverlayIndex(tmp);
    assert.deepStrictEqual(written, ['a.json', 'b.json']);
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(tmp, 'index.json'), 'utf8')), ['a.json', 'b.json']);

    // Second run with no change: file must not be rewritten (same mtime).
    const before = fs.statSync(path.join(tmp, 'index.json')).mtimeMs;
    writeOverlayIndex(tmp);
    assert.equal(fs.statSync(path.join(tmp, 'index.json')).mtimeMs, before, 'idempotent: unchanged file is not rewritten');

    // Adding a file shows up on the next run.
    fs.writeFileSync(path.join(tmp, 'c.json'), '{}');
    assert.deepStrictEqual(writeOverlayIndex(tmp), ['a.json', 'b.json', 'c.json']);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

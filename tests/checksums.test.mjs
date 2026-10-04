import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function readSum() {
  const text = fs.readFileSync(path.join(ROOT, 'SHA256SUMS'), 'utf8');
  const files = new Map();
  for (const line of text.split('\n')) {
    const parts = line.trim().match(/^([0-9a-f]{64})\s+(\S+)$/);
    if (parts) files.set(parts[2], parts[1]);
  }
  return { text, files };
}

test('SHA256SUMS is in sync with the working tree', () => {
  const { files } = readSum();
  const tracked = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const expected = tracked.filter(
    (rel) => rel !== 'SHA256SUMS' && !rel.startsWith('data/') && !rel.startsWith('legacy/'),
  );
  // Every tracked code/config file (question bank excluded) is listed…
  for (const rel of expected) {
    assert.ok(files.has(rel), `SHA256SUMS is missing: ${rel}`);
    assert.equal(files.get(rel), sha256(path.join(ROOT, rel)), `stale hash for ${rel}`);
  }
  // …and nothing else.
  for (const rel of files.keys()) {
    assert.ok(expected.includes(rel), `SHA256SUMS lists untracked/foreign file: ${rel}`);
  }
  assert.equal(files.size, expected.length);
});

/** Same loop install.sh runs to verify a downloaded copy of $root. */
function installerChecksumLoop(root) {
  const text = fs.readFileSync(path.join(root, 'SHA256SUMS'), 'utf8');
  const bad = [];
  for (const line of text.split('\n')) {
    const m = line.match(/^([0-9a-fA-F]{64})\s+(\S+)\s*$/);
    if (!m) continue;
    const [hash, rel] = [m[1].toLowerCase(), m[2]];
    const full = path.join(root, rel);
    if (!fs.existsSync(full)) {
      bad.push(`missing: ${rel}`);
      continue;
    }
    if (sha256(full) !== hash) bad.push(`mismatch: ${rel}`);
  }
  return bad;
}

test('installer loop passes on the working tree and catches tampering', () => {
  assert.deepEqual(installerChecksumLoop(ROOT), []);

  const copy = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-checksum-'));
  try {
    const pkg = path.join(copy, 'package.json');
    fs.copyFileSync(path.join(ROOT, 'package.json'), pkg);
    fs.writeFileSync(path.join(copy, 'SHA256SUMS'), `${sha256(pkg)}  package.json\n`);
    assert.deepEqual(installerChecksumLoop(copy), []);
    // One bit flipped in one file, or a file gone — both are refused.
    fs.writeFileSync(pkg, fs.readFileSync(pkg, 'utf8').replace(/"version": "[^"]*"/, '"version": "9.9.9"'));
    assert.deepEqual(installerChecksumLoop(copy), ['mismatch: package.json']);
    fs.rmSync(pkg);
    assert.deepEqual(installerChecksumLoop(copy), ['missing: package.json']);
  } finally {
    fs.rmSync(copy, { recursive: true, force: true });
  }
});

test('install.sh verifies SHA256SUMS and aborts on any mismatch', () => {
  const sh = fs.readFileSync(path.join(ROOT, 'install.sh'), 'utf8');
  assert.match(sh, /SHA256SUMS/);
  assert.match(sh, /Integrity check FAILED/);

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-installer-'));
  const src = path.join(root, 'src');
  fs.mkdirSync(path.join(src, 'server'), { recursive: true });
  fs.mkdirSync(path.join(src, 'bin'), { recursive: true });
  fs.writeFileSync(path.join(src, 'server', 'index.js'), 'module.exports = 1;\n');
  fs.writeFileSync(path.join(src, 'bin', 'patente-pro.js'), '#!/usr/bin/env node\n');
  const pkg = path.join(src, 'package.json');
  fs.writeFileSync(pkg, JSON.stringify({ version: '0.0.0' }));
  const sums = path.join(src, 'SHA256SUMS');

  const install = () =>
    spawnSync('bash', [path.join(ROOT, 'install.sh')], {
      env: {
        ...process.env,
        PP_HOME: path.join(root, 'home'),
        PP_NO_DESKTOP: '1',
        PP_SRC: src,
      },
      encoding: 'utf8',
    });

  try {
    // A copy whose SHA256SUMS matches installs past the integrity step…
    fs.writeFileSync(sums, `${sha256(pkg)}  package.json\n`);
    const ok = install();
    assert.equal(ok.status, 0, ok.stderr + ok.stdout);
    assert.match(ok.stdout, /Verifying checksums \(SHA256SUMS/);
    assert.ok(fs.existsSync(path.join(root, 'home', 'package.json')));

    // …and the very same copy with one altered file is refused.
    fs.rmSync(path.join(root, 'home'), { recursive: true, force: true });
    fs.writeFileSync(pkg, JSON.stringify({ version: '1.0.0' }));
    const bad = install();
    assert.notEqual(bad.status, 0);
    assert.match(bad.stdout, /Integrity check FAILED/);
    assert.match(bad.stdout, /mismatch: package\.json/);
    assert.ok(!fs.existsSync(path.join(root, 'home', 'package.json')), 'must not install on mismatch');

    // A ref that predates SHA256SUMS installs without verification (local copy).
    fs.rmSync(path.join(root, 'home'), { recursive: true, force: true });
    fs.writeFileSync(pkg, JSON.stringify({ version: '0.0.0' }));
    fs.rmSync(sums);
    const legacy = install();
    assert.equal(legacy.status, 0, legacy.stderr + legacy.stdout);
    assert.ok(!/Integrity/.test(legacy.stdout));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('install.ps1 verifies SHA256SUMS and aborts on any mismatch', () => {
  const ps = fs.readFileSync(path.join(ROOT, 'install.ps1'), 'utf8');
  assert.match(ps, /SHA256SUMS/);
  assert.match(ps, /Get-FileHash/);
  assert.match(ps, /Integrity check FAILED/);
  assert.match(ps, /Join-Path \$src 'server\\index\.js'/, 'server\\index.js guard must stay');
});

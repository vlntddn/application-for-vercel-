import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { releaseFiles, checksumLines, verifyChecksums } from '../scripts/make-checksums.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function fakeRelease() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-sums-'));
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ files: ['server', 'install.sh'] }));
  fs.mkdirSync(path.join(dir, 'server'));
  fs.writeFileSync(path.join(dir, 'server', 'index.js'), 'console.log(1);\n');
  fs.writeFileSync(path.join(dir, 'install.sh'), '#!/bin/sh\n');
  fs.writeFileSync(path.join(dir, 'SHA256SUMS'), checksumLines(dir).join('\n') + '\n');
  return dir;
}

test('release checksums cover the shipped files and verify clean (SEC6)', () => {
  const files = releaseFiles(ROOT);
  for (const f of ['package.json', 'server/index.js', 'bin/patente-pro.js', 'public/index.html', 'install.sh']) {
    assert.ok(files.includes(f), f);
  }
  const dir = fakeRelease();
  assert.deepEqual(verifyChecksums(dir), []);
});

test('a changed or missing file is reported as a mismatch (SEC6)', () => {
  const dir = fakeRelease();
  fs.appendFileSync(path.join(dir, 'server', 'index.js'), 'evil();\n');
  fs.rmSync(path.join(dir, 'install.sh'));
  assert.deepEqual(verifyChecksums(dir).sort(), ['install.sh', 'server/index.js']);
});

test('SHA256SUMS is in the format sha256sum -c reads, as install.sh uses it', (t) => {
  try { execFileSync('sha256sum', ['--version'], { stdio: 'ignore' }); } catch { t.skip('no sha256sum'); return; }
  const dir = fakeRelease();
  execFileSync('sha256sum', ['-c', 'SHA256SUMS'], { cwd: dir, stdio: 'ignore' });
  fs.appendFileSync(path.join(dir, 'server', 'index.js'), 'x');
  assert.throws(() => execFileSync('sha256sum', ['-c', 'SHA256SUMS'], { cwd: dir, stdio: 'ignore' }));
});

test('both installers refuse to install on a checksum mismatch', () => {
  const sh = fs.readFileSync(path.join(ROOT, 'install.sh'), 'utf8');
  assert.match(sh, /SHA256SUMS/);
  assert.match(sh, /Checksum mismatch[^\n]*\n?[^\n]*Nothing was installed/);
  const ps = fs.readFileSync(path.join(ROOT, 'install.ps1'), 'utf8');
  assert.match(ps, /Get-FileHash -Algorithm SHA256/);
  assert.match(ps, /Die "Checksum mismatch/);
});

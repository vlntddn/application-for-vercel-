import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { findSecrets, remoteHasCredentials } from '../scripts/scan-secrets.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Built at runtime so this file never contains a token-shaped string itself.
const fake = (prefix, n = 30) => prefix + 'a1B2'.repeat(Math.ceil(n / 4)).slice(0, n);

test('secret scan recognises each kind of credential (SEC4)', () => {
  assert.deepEqual(findSecrets(`token=${fake('ghp_')}`), ['GitHub token']);
  assert.deepEqual(findSecrets(fake('github_pat_')), ['GitHub fine-grained token']);
  assert.deepEqual(findSecrets(fake('sk-')), ['API key (sk-)']);
  assert.deepEqual(findSecrets('AKIA' + 'ABCDEFGHIJKLMNOP'), ['AWS access key']);
  assert.deepEqual(findSecrets(['-----BEGIN', 'RSA PRIVATE KEY-----'].join(' ')), ['private key']);
});

test('secret scan stays quiet on ordinary text and on its own patterns', () => {
  assert.deepEqual(findSecrets('ghp_ short, sk-1, task-list, AKIA lower'), []);
  for (const file of ['scripts/scan-secrets.mjs', 'scripts/verify.sh', 'docs/SECURITY-AUDIT-2026-10-04.md']) {
    assert.deepEqual(findSecrets(fs.readFileSync(path.join(ROOT, file), 'utf8')), [], file);
  }
});

test('remote URLs with a login or token are flagged, plain ones are not', () => {
  assert.equal(remoteHasCredentials('https://github.com/vlntddn/repo.git'), false);
  assert.equal(remoteHasCredentials('git@github.com:vlntddn/repo.git'), false);
  assert.equal(remoteHasCredentials('ssh://git@github.com/vlntddn/repo.git'), false);
  assert.equal(remoteHasCredentials(`https://vlntddn:${fake('ghp_')}@github.com/vlntddn/repo.git`), true);
  assert.equal(remoteHasCredentials(`https://${fake('ghp_')}@github.com/vlntddn/repo.git`), true);
});

test('the scanner CLI fails on a planted token and names only the file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-secret-'));
  const planted = path.join(dir, 'leak.txt');
  const token = fake('ghp_');
  fs.writeFileSync(planted, `GITHUB_TOKEN=${token}\n`);
  const clean = path.join(dir, 'clean.txt');
  fs.writeFileSync(clean, 'nothing here\n');
  const run = (file) => {
    try {
      return { code: 0, out: execFileSync(process.execPath, ['scripts/scan-secrets.mjs', file], { cwd: ROOT, encoding: 'utf8' }) };
    } catch (err) {
      return { code: err.status, out: String(err.stdout) };
    }
  };
  const bad = run(planted);
  assert.equal(bad.code, 1);
  assert.match(bad.out, /leak\.txt: looks like a GitHub token/);
  assert.ok(!bad.out.includes(token), 'the secret itself must not be printed');
  assert.equal(run(clean).code, 0);
});

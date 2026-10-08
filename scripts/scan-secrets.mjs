#!/usr/bin/env node
/**
 * Secret scanner for scripts/verify.sh (SEC4).
 *
 * Usage: node scripts/scan-secrets.mjs [file...]
 * Scans the given files, the messages of unpushed commits and the origin
 * URL. Prints one FAIL line per finding — the file and the kind of secret,
 * never the secret itself — and exits 1 if anything was found.
 */
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const SECRET_PATTERNS = [
  ['GitHub token', /gh[pousr]_[A-Za-z0-9]{20,}/],
  ['GitHub fine-grained token', /github_pat_[A-Za-z0-9_]{20,}/],
  ['API key (sk-)', /sk-[A-Za-z0-9_-]{20,}/],
  ['AWS access key', /AKIA[0-9A-Z]{16}/],
  ['private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
];

/** Names of the secret kinds found in `text` (empty when clean). */
export function findSecrets(text) {
  return SECRET_PATTERNS.filter(([, re]) => re.test(text)).map(([name]) => name);
}

/** True when a git remote URL carries credentials (user:token@host); plain ssh://git@ is fine. */
export function remoteHasCredentials(url) {
  const m = String(url).trim().match(/^[a-z+]+:\/\/([^/@]*)@/i);
  return Boolean(m) && m[1] !== 'git';
}

function git(cmd) {
  try {
    return execSync(`git ${cmd}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null;
  }
}

function main(files) {
  const problems = [];
  for (const file of files) {
    let text;
    try {
      if (!fs.statSync(file).isFile()) continue;
      text = fs.readFileSync(file, 'latin1');
    } catch {
      continue; // deleted in this change
    }
    for (const kind of findSecrets(text)) problems.push(`${file}: looks like a ${kind}`);
  }

  // Commits not pushed yet; without an upstream, the last 20.
  const messages = git('log --format=%H%x00%B%x01 @{u}..HEAD') ?? git('log --format=%H%x00%B%x01 -n 20') ?? '';
  for (const entry of messages.split('\x01')) {
    const [sha, body = ''] = entry.trim().split('\x00');
    for (const kind of findSecrets(body)) problems.push(`commit ${sha.slice(0, 7)} message: looks like a ${kind}`);
  }

  const origin = git('remote get-url origin');
  if (origin && remoteHasCredentials(origin)) {
    problems.push('git remote "origin" contains a login or token — use a URL without "user@"');
  }

  for (const p of problems) console.log(`FAIL  secret scan: ${p}`);
  return problems.length ? 1 : 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}

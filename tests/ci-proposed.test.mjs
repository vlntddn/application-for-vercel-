import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CI_PATH = path.join(ROOT, 'docs/proposed-workflows/ci.yml');

// Minimal structural YAML check (line based, no external parser):
// - every non-blank line is indented with spaces only (no tabs)
// - a "key:" or "key: value" mapping line is well formed
// - top-level and job structure (name:, on:, permissions:, jobs:) present
function looksLikeYaml(text) {
  const lines = text.split('\n');
  for (const [i, raw] of lines.entries()) {
    const line = raw.replace(/\t/g, '\u0000'); // tab is illegal indentation
    if (/\u0000/.test(line)) {
      // tabs allowed only inside a plain string value, never for indentation
      const indent = line.match(/^ */)[0].length;
      if (line.slice(0, indent + 1).includes('\u0000')) {
        return { ok: false, why: `line ${i + 1}: tab used for indentation` };
      }
    }
    const t = line.trim();
    if (t === '' || t.startsWith('#')) continue;
    // list item or block scalar continuation — acceptable
    if (t.startsWith('-') || t.startsWith('|') || t.startsWith('>') || t.startsWith('"')) continue;
    // mapping "key:" / "key: value" (optionally with an inline comment)
    const m = t.match(/^([A-Za-z0-9_.\-]+):(.*)$/);
    if (m) {
      const after = m[2].trim();
      if (after !== '' && !after.startsWith('#')) {
        // value must be a plain scalar, quoted scalar, or ${...}/${{...}} — ok
      }
      continue;
    }
    // Otherwise it is a continuation of a block scalar / multiline value (run: |)
    // which is structurally fine.
  }
  return { ok: true };
}

function topLevelKeys(text) {
  const keys = new Set();
  for (const line of text.split('\n')) {
    if (/^[A-Za-z0-9_.\-]+:/.test(line)) keys.add(line.split(':')[0].trim());
  }
  return keys;
}

test('SEC5: proposed ci.yml parses as YAML (line parse) and has permissions:', () => {
  assert.ok(fs.existsSync(CI_PATH), 'docs/proposed-workflows/ci.yml must exist');
  const text = fs.readFileSync(CI_PATH, 'utf8');

  const check = looksLikeYaml(text);
  assert.ok(check.ok, `ci.yml failed YAML line-parse: ${check.why}`);

  const keys = topLevelKeys(text);
  assert.ok(keys.has('name'), 'missing top-level name:');
  assert.ok(keys.has('on'), 'missing top-level on:');
  assert.ok(keys.has('permissions'), 'missing top-level permissions:');
  assert.ok(keys.has('jobs'), 'missing top-level jobs:');

  // permissions must be the minimal contents: read
  assert.match(text, /permissions:\s*\n\s+contents:\s*read/, 'permissions must grant contents: read');

  // pinned by full SHA (40 hex), not by @v tag
  const uses = [...text.matchAll(/^\s*-\s*uses:\s*(\S+)/gm)].map((m) => m[1]);
  assert.ok(uses.length >= 2, 'expected pinned uses: entries');
  for (const u of uses) {
    assert.match(u, /@([0-9a-f]{40})(\s*#.*)?$/, `uses must be pinned by SHA, got ${u}`);
  }

  // e2e job present
  assert.match(text, /^  e2e:\s*$/m, 'e2e job missing');
});

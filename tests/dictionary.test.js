import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LANGS = ['en', 'ru', 'zh'];

const dictionary = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'dictionary.json'), 'utf8'));
const theory = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'theory.json'), 'utf8'));

test('dictionary sections are well-formed', () => {
  assert.ok(Array.isArray(dictionary.sections) && dictionary.sections.length > 0);
  const ids = new Set();
  for (const sec of dictionary.sections) {
    assert.match(sec.id, /^[a-z-]+$/, `section id: ${sec.id}`);
    assert.ok(!ids.has(sec.id), `duplicate section id: ${sec.id}`);
    ids.add(sec.id);
    assert.ok(sec.title_it, `title_it missing in ${sec.id}`);
    for (const l of LANGS) {
      assert.ok(sec.titles?.[l], `section ${sec.id} missing ${l} title`);
    }
    assert.ok(Array.isArray(sec.chapters), `chapters missing in ${sec.id}`);
    assert.ok(sec.terms.length >= 5, `section ${sec.id} has too few terms`);
  }
});

test('every term has Italian and all translations', () => {
  for (const sec of dictionary.sections) {
    for (const term of sec.terms) {
      assert.ok(term.it?.trim(), `empty it term in ${sec.id}`);
      for (const l of LANGS) {
        assert.ok(term[l]?.trim(), `term "${term.it}" missing ${l}`);
      }
    }
  }
});

test('section chapter references point to real theory chapters', () => {
  const chapterIds = new Set(theory.map((c) => c.id));
  for (const sec of dictionary.sections) {
    for (const ref of sec.chapters) {
      assert.ok(chapterIds.has(ref), `section ${sec.id} references unknown chapter ${ref}`);
    }
  }
});

test('every theory chapter has at least one dictionary section', () => {
  const covered = new Set(dictionary.sections.flatMap((s) => s.chapters));
  for (const ch of theory) {
    assert.ok(covered.has(ch.id), `chapter ${ch.id} (${ch.title_it}) has no dictionary section`);
  }
});

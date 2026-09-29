import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TOPICS, topicLabel } from '../public/js/topics.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'data/manifest.json'), 'utf8'),
);

const LANGS = ['it', 'en', 'ru', 'zh'];

test('every manifest slug has a topic with all 4 languages', () => {
  assert.ok(manifest.categories.length >= 25, 'manifest has 25 categories');
  for (const cat of manifest.categories) {
    const t = TOPICS[cat.slug];
    assert.ok(t, `topics.js is missing slug ${cat.slug}`);
    for (const lang of LANGS) {
      const v = t.label && t.label[lang];
      assert.ok(typeof v === 'string' && v.trim(), `${cat.slug} has no ${lang} label`);
    }
    // normal case (not the all-caps slug style) for the cased languages
    for (const lang of ['it', 'en', 'ru']) {
      const v = t.label[lang];
      assert.ok(/[a-zа-яё]/.test(v), `${cat.slug} ${lang} label should be normal case: ${v}`);
    }
  }
});

test('topicLabel renders the Italian exam-language name (sentence case)', () => {
  const t = TOPICS['segnali-divieto'];
  assert.equal(topicLabel({ slug: 'segnali-divieto' }), t.label.it);
  // normal case: first letter upper, not the rest
  assert.ok(!/^[A-Z ]+$/.test(topicLabel({ slug: 'segnali-divieto' })),
    'label is not all-uppercase');
});

test('unknown slug falls back to a title-cased name', () => {
  const out = topicLabel({ slug: 'does-not-exist', name: 'foo bar baz' });
  assert.equal(out, 'Foo Bar Baz');
});

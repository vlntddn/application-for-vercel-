import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MESSAGES, LANGUAGES, t, setLang } from '../public/js/i18n.js';

/** Q4.1 — i18n foundation: every key in all 3 languages, matching placeholders. */

function placeholders(str) {
  return [...str.matchAll(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g)].map((m) => m[1]).sort();
}

for (const lang of LANGUAGES) {
  test(`every key has a non-empty string in ${lang}`, () => {
    for (const [key, value] of Object.entries(MESSAGES.en)) {
      const v = MESSAGES[lang][key];
      assert.equal(typeof v, 'string', `${key}: ${lang} value must be a string, got ${typeof v}`);
      assert.ok(v.trim().length > 0, `${key}: ${lang} value must not be empty`);
    }
  });

  test(`no extra keys in ${lang} compared to en`, () => {
    const extra = Object.keys(MESSAGES[lang]).filter((k) => !(k in MESSAGES.en));
    assert.deepEqual(extra, [], `keys only in ${lang}: ${extra.join(', ')}`);
  });

  test(`{…} placeholders match en in ${lang}`, () => {
    for (const [key, value] of Object.entries(MESSAGES.en)) {
      assert.deepEqual(
        placeholders(MESSAGES[lang][key]),
        placeholders(value),
        `${key}: placeholder mismatch between en and ${lang}`,
      );
    }
  });
}

test('t() falls back to English for a missing key', () => {
  for (const lang of LANGUAGES) {
    setLang(lang);
    assert.equal(t('no.such.key'), 'no.such.key');
  }
});

test('t() translates and substitutes {name} placeholders', () => {
  // Regression hook: the foundation must support placeholder interpolation.
  setLang('ru');
  MESSAGES.ru['__tmp.test'] = 'Привет, {name}!';
  MESSAGES.en['__tmp.test'] = 'Hi, {name}!';
  try {
    setLang('ru');
    assert.equal(t('__tmp.test', { name: 'QA' }), 'Привет, QA!');
    setLang('en');
    assert.equal(t('__tmp.test', { name: 'QA' }), 'Hi, QA!');
    setLang('zh'); // not present in zh → en fallback
    assert.equal(t('__tmp.test', { name: 'QA' }), 'Hi, QA!');
  } finally {
    delete MESSAGES.ru['__tmp.test'];
    delete MESSAGES.en['__tmp.test'];
  }
});

test('setLang() rejects unknown codes (falls back to en)', () => {
  setLang('fr');
  assert.equal(t('ob.title1'), MESSAGES.en['ob.title1']);
  setLang('en');
});

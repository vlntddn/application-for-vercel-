import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LANGS = ['en', 'ru', 'zh'];

const lessons = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'lessons.json'), 'utf8'));
const theory = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'theory.json'), 'utf8'));

// Mirrors public/js/theory-map.js for the chapters that carry lessons.
const CHAPTER_CATEGORY = {
  ch1: 'definizioni-generali-doveri-strada',
  ch2: 'segnali-pericolo',
  ch3: 'segnali-divieto',
  ch4: 'segnali-obbligo',
  ch5: 'segnali-precedenza',
  ch6: 'segnaletica-orizzontale-ostacoli',
  ch7: 'semafori-vigili',
  ch8: 'limiti-di-velocita',
  ch9: 'distanza-di-sicurezza',
  ch10: 'norme-di-circolazione',
  ch11: 'precedenza-incroci',
  ch12: 'sorpasso',
  ch13: 'fermata-sosta-arresto',
  ch14: 'norme-varie-autostrade-pannelli',
  ch15: 'luci-dispositivi-acustici',
  ch16: 'patente-punti-documenti',
  ch17: 'incidenti-stradali-comportamenti',
  ch18: 'alcool-droga-primo-soccorso',
  ch19: 'responsabilita-civile-penale-e-assicurazione',
  ch20: 'consumi-ambiente-inquinamento',
  ch21: 'elementi-veicolo-manutenzione-comportamenti',
  ch22: 'cinture-casco-sicurezza',
  ch23: 'norme-varie-autostrade-pannelli',
  ch24: 'segnali-indicazione',
  ch25: 'segnali-complementari-cantiere',
};

function assertLocalized(obj, where) {
  for (const l of LANGS) {
    assert.ok(typeof obj?.[l] === 'string' && obj[l].length > 0, `${where}: missing "${l}"`);
  }
}

test('exam-italian guide is complete in all languages', () => {
  const g = lessons.examItalian;
  assert.ok(g.title_it);
  assertLocalized(g.intro, 'examItalian.intro');
  assert.ok(g.sections.length >= 3, 'guide needs at least 3 sections');
  for (const s of g.sections) {
    assert.ok(s.title_it, 'section title_it');
    assertLocalized(s.explain, `section "${s.title_it}"`);
    assert.ok(s.entries.length >= 3, `section "${s.title_it}" needs entries`);
    for (const w of s.entries) {
      assert.ok(w.it, 'entry.it');
      assertLocalized(w.gloss, `gloss of "${w.it}"`);
    }
  }
  assert.ok(g.tips.length >= 2);
  for (const t of g.tips) assertLocalized(t, 'tip');
});

test('exam-italian absolute words carry bank stats from the real bank', () => {
  const fsq = fs.readFileSync(path.join(ROOT, 'data', 'insights', 'signal-words.json'), 'utf8');
  const sw = JSON.parse(fsq);
  const byWord = new Map(sw.words.map((w) => [w.word, w]));
  const section = lessons.examItalian.sections.find((x) => x.title_it.startsWith('Le parole assolute'));
  assert.ok(section, 'absolute-words section');
  const stats = new Map(section.entries.filter((e) => e.bankStats).map((e) => [e.it, e.bankStats]));
  // words that passed the >=20 threshold in L1a must show their stats
  for (const key of ['sempre', 'solo / soltanto', 'anche']) {
    const b = stats.get(key);
    assert.ok(b, `entry "${key}" must have bankStats`);
    const ref = byWord.get(key.split(' ')[0]);
    assert.ok(ref, `signal word for "${key}"`);
    assert.equal(b.questions, ref.questions);
    assert.equal(b.falseRatio, ref.falseRatio);
    assert.equal(b.bank, ref.bank);
    assertLocalized(b.takeaway, `takeaway of "${key}"`);
    // the counter-example must be a real, TRUE question of the bank
    if (b.firstTrue) {
      assert.ok(b.firstTrue.questionId && b.firstTrue.text_it, `firstTrue of "${key}"`);
      const file = path.join(ROOT, 'data', 'questions', `${b.firstTrue.id}.json`);
      const bank = JSON.parse(fs.readFileSync(file, 'utf8'));
      const found = bank.find((x) => x.id === b.firstTrue.questionId);
      assert.ok(found, `counter-example question exists in bank`);
      assert.equal(found.is_true, true, 'counter-example is actually VERO');
    }
  }
  // mai has no stats (below threshold) but a takeaway explaining why
  const mai = section.entries.find((e) => e.it.startsWith('mai'));
  assert.ok(mai && mai.bankStats && !mai.bankStats.questions, 'mai: takeaway without a number');
  assertLocalized(mai.bankStats.takeaway, 'mai takeaway');
});

test('chapter lessons are well-formed and fully translated', () => {
  const ids = Object.keys(lessons.chapters);
  assert.ok(ids.length >= 8, 'expected lessons for the core chapters');
  const chapterIds = new Set(theory.map((c) => c.id));
  for (const [id, lesson] of Object.entries(lessons.chapters)) {
    assert.ok(chapterIds.has(id), `unknown chapter: ${id}`);
    assertLocalized(lesson.objective, `${id}.objective`);
    assert.ok(lesson.keyIdeas.length >= 2, `${id}: needs keyIdeas`);
    for (const idea of lesson.keyIdeas) {
      assert.ok(idea.title_it, `${id} keyIdea title`);
      assertLocalized(idea.text, `${id} keyIdea "${idea.title_it}"`);
    }
    assert.ok(lesson.mustKnow.length >= 2, `${id}: needs mustKnow`);
    for (const f of lesson.mustKnow) {
      assert.ok(f.fact_it && f.value, `${id} mustKnow entry`);
      if (f.note) assertLocalized(f.note, `${id} note of "${f.fact_it}"`);
    }
    assert.ok(lesson.traps.length >= 1, `${id}: needs traps`);
    for (const t of lesson.traps) assertLocalized(t.why, `${id} trap ${t.id}`);
  }
});

test('every trap references a real question in the chapter category', () => {
  for (const [chId, lesson] of Object.entries(lessons.chapters)) {
    const slug = CHAPTER_CATEGORY[chId];
    assert.ok(slug, `no category mapping for ${chId}`);
    const questions = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'data', 'questions', `${slug}.json`), 'utf8'),
    );
    const byId = new Map(questions.map((q) => [q.id, q]));
    for (const t of lesson.traps) {
      assert.ok(byId.has(t.id), `${chId}: trap question not found: ${t.id}`);
    }
  }
});

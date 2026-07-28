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
  ch8: 'limiti-di-velocita',
  ch9: 'distanza-di-sicurezza',
  ch11: 'precedenza-incroci',
  ch12: 'sorpasso',
  ch13: 'fermata-sosta-arresto',
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

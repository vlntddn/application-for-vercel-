import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  shuffled,
  queueOrder,
  masteryOf,
  categoryStats,
  introQueue,
  INTRO_QUESTIONS,
  INTRO_TEXT_LEN,
  hasSignalWord,
  signalQueue,
  signalSpans,
  attemptedCount,
  signalHintsEnabled,
  SIGNAL_HINTS_AUTO_LIMIT,
  mistakeCauses,
  learningPath,
  PATH_ORDER,
  PATH_MINI_PASS,
  PATH_MASTERY_PCT,
  nextStepAction,
  examReadiness,
  EXAM_READINESS_MIN_ANSWERS,
} from '../public/js/domain/learning.js';
import { CHAPTER_CATEGORY } from '../public/js/theory-map.js';
import { fileURLToPath } from 'node:url';

const manifest = JSON.parse(
  fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'manifest.json'), 'utf8'),
);
const lessons = JSON.parse(
  fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'lessons.json'), 'utf8'),
);

/** Deterministic PRNG (mulberry32) — stable order across runs/Node versions. */
function rand32(seed = 42) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const q = (id, extra = {}) => ({ id, text_it: 'test', ...extra });
const seen = (lastCorrect, correct = 1, wrong = 0) => ({ correct, wrong, lastCorrect });

test('queueOrder: unseen first, then current mistakes, then the rest', () => {
  const questions = [q('t-1'), q('t-2'), q('t-3'), q('t-4'), q('t-5'), q('t-6')];
  const answers = {
    't-1': seen(true),
    't-2': seen(false, 0, 1),
    't-3': seen(true, 2, 1),
  };
  const order = queueOrder(questions, answers, 20, rand32());
  assert.deepEqual(new Set(order.slice(0, 3).map((x) => x.id)), new Set(['t-4', 't-5', 't-6']));
  assert.deepEqual(new Set(order.slice(3, 4).map((x) => x.id)), new Set(['t-2']));
  assert.deepEqual(new Set(order.slice(4).map((x) => x.id)), new Set(['t-1', 't-3']));
  assert.equal(order.length, 6);
});

test('queueOrder respects count and never duplicates', () => {
  const questions = [q('t-1'), q('t-2'), q('t-3'), q('t-4')];
  const order = queueOrder(questions, {}, 2, rand32());
  assert.equal(order.length, 2);
  assert.equal(new Set(order).size, 2);
});

test('queueOrder is deterministic with an injected rand', () => {
  const questions = Array.from({ length: 50 }, (_, i) => q(`t-${i}`));
  const answers = { 't-7': seen(false, 0, 1), 't-11': seen(true) };
  const a = queueOrder(questions, answers, 20, rand32(7));
  const b = queueOrder(questions, answers, 20, rand32(7));
  assert.deepEqual(a.map((x) => x.id), b.map((x) => x.id));
});

test('masteryOf counts only ids of its own slug (segnali ≠ segnali-divieto)', () => {
  const answers = {
    'segnali-pericolo-1': seen(true),
    'segnali-pericolo-2': seen(false, 0, 1),
    'segnali-divieto-1': seen(true),
  };
  assert.deepEqual(masteryOf(answers, 'segnali-pericolo', 3), { mastered: 1, pct: 33 });
  assert.deepEqual(masteryOf(answers, 'segnali-divieto', 2), { mastered: 1, pct: 50 });
});

test('masteryOf: every slug in the manifest counts only its own ids', () => {
  // Answer every id of every topic last-correct: each topic must report
  // exactly its manifest count, proving no slug bleeds into a neighbor.
  const answers = {};
  const perSlug = {};
  for (const cat of manifest.categories) {
    for (let i = 1; i <= cat.count; i += 1) {
      const id = `${cat.slug}-${i}`;
      answers[id] = seen(true);
      perSlug[cat.slug] = perSlug[cat.slug] ?? 0;
      perSlug[cat.slug] += 1;
    }
  }
  for (const cat of manifest.categories) {
    const { mastered, pct } = masteryOf(answers, cat.slug, cat.count);
    assert.equal(mastered, perSlug[cat.slug], `slug ${cat.slug} counted foreign ids`);
    assert.equal(pct, 100);
  }
});

test('categoryStats: attempted/mastered/accuracy per topic, null accuracy when untouched', () => {
  const categories = [
    { slug: 'segnali', name: 'Segnali', count: 3 },
    { slug: 'limiti', name: 'Limiti', count: 10 },
  ];
  const answers = {
    'segnali-1': seen(true),
    'segnali-2': { correct: 1, wrong: 1, lastCorrect: false },
    'limiti-5': seen(true),
  };
  const stats = categoryStats(answers, categories);
  assert.deepEqual(stats[0], {
    slug: 'segnali', name: 'Segnali', count: 3,
    attempted: 2, mastered: 1, masteredPct: 33, accuracy: 67,
  });
  assert.deepEqual(stats[1], {
    slug: 'limiti', name: 'Limiti', count: 10,
    attempted: 1, mastered: 1, masteredPct: 10, accuracy: 100,
  });
  const empty = categoryStats({}, [{ slug: 'x', name: 'X', count: 4 }])[0];
  assert.equal(empty.accuracy, null);
  assert.equal(empty.masteredPct, 0);
});

test('introQueue: easiest unseen questions first, remainder keeps queue order', () => {
  const short = (n) => 'a'.repeat(n);
  const questions = [
    q('s-1', { text_it: short(30) }),
    q('s-2', { text_it: short(40) }),
    q('s-3', { text_it: short(50) }),
    q('s-4', { text_it: short(60) }),
    q('s-5', { text_it: short(70) }),
    q('s-6', { text_it: short(80) }),
    q('s-7', { text_it: 'long'.repeat(40) }),
    q('s-8', { text_it: short(20), image_url: '/img/sign.png' }),
    q('s-9', { text_it: 'z'.repeat(200) }),
  ];
  const answers = { 's-1': seen(true) }; // s-1 no longer "unseen"
  const order = introQueue(questions, { answers, batch: 20 });
  assert.equal(order.length, 9);
  // Exactly 5 easy unseen (≤120 chars, no image): s-2..s-6
  assert.deepEqual(new Set(order.slice(0, 5).map((x) => x.id)),
    new Set(['s-2', 's-3', 's-4', 's-5', 's-6']));
  assert.deepEqual(new Set(order.slice(5).map((x) => x.id)),
    new Set(['s-1', 's-7', 's-8', 's-9']));
});

test('introQueue: null when fewer than count easy questions exist', () => {
  const questions = [q('s-1', { text_it: 'a'.repeat(10) }), q('s-2', { text_it: 'b'.repeat(200) })];
  assert.equal(introQueue(questions, { answers: {} }), null);
});

test('introQueue honors custom count/textLen and skips already-answered questions', () => {
  const questions = [
    q('s-1', { text_it: 'a'.repeat(10) }),
    q('s-2', { text_it: 'b'.repeat(20) }),
    q('s-3', { text_it: 'c'.repeat(20) }),
    q('s-4', { text_it: 'd'.repeat(30) }),
  ];
  const answers = { 's-1': seen(true) };
  const order = introQueue(questions, { answers, count: 2, textLen: 20 });
  assert.equal(order.length, 4);
  // intro = the 2 easy UNSEEN questions (text ≤ 20 chars): s-2, s-3
  assert.deepEqual(new Set(order.slice(0, 2).map((x) => x.id)), new Set(['s-2', 's-3']));
  // s-1 (answered, last-correct) and s-4 (too long) form the remainder
  assert.deepEqual(new Set(order.slice(2).map((x) => x.id)), new Set(['s-1', 's-4']));
});

test('default constants match the historical view values', () => {
  assert.equal(INTRO_QUESTIONS, 5);
  assert.equal(INTRO_TEXT_LEN, 120);
});

test('shuffled is a pure permutation and respects injected rand', () => {
  const list = [1, 2, 3, 4, 5, 6, 7];
  const a = shuffled(list, rand32(1));
  const b = shuffled(list, rand32(1));
  assert.deepEqual(a, b);
  assert.deepEqual([...a].sort((x, y) => x - y), list);
  assert.notDeepEqual(a, list);
});

test('hasSignalWord: word boundaries, case, accents and phrases', () => {
  assert.equal(hasSignalWord('Deve sempre frenare', 'sempre'), true);
  assert.equal(hasSignalWord('Maiolati e mai dire', 'mai'), true); // word boundary
  assert.equal(hasSignalWord('Maiolati', 'mai'), false);
  assert.equal(hasSignalWord('PUÒ andare', 'può'), true); // case
  assert.equal(hasSignalWord('Purchè non piove', 'purché'), true); // accents folded
  assert.equal(hasSignalWord('Non oltre i 90', 'non oltre'), true); // phrase
  assert.equal(hasSignalWord('Non oltranza', 'non oltre'), false);
});

test('signalQueue: ~50/50 FALSO/VERO mix, tagged, no duplicates', () => {
  const insights = { words: [{ word: 'solo' }, { word: 'mai' }] };
  const questions = [
    q('solo-f1', { text_it: 'Solo i taxi possono', is_true: false }),
    q('solo-f2', { text_it: 'Ecco solo un caso', is_true: false }),
    q('solo-t1', { text_it: 'Solo questo è vero', is_true: true }),
    q('solo-t2', { text_it: 'Solo il gatto', is_true: true }),
    q('mai-f1', { text_it: 'Mai superare', is_true: false }),
    q('mai-t1', { text_it: 'Mai più di 50', is_true: true }),
    q('other-1', { text_it: 'Nessun segnale qui', is_true: false }),
  ];
  const order = signalQueue(questions, insights, 6, rand32());
  assert.equal(order.length, 6);
  const falses = order.filter((x) => x.is_true === false);
  const trues = order.filter((x) => x.is_true === true);
  assert.equal(falses.length, 3);
  assert.equal(trues.length, 3);
  assert.ok(order.every((x) => ['solo', 'mai'].includes(x.signalWord)));
  assert.ok(!order.some((x) => x.id === 'other-1'));
  assert.equal(new Set(order.map((x) => x.id)).size, 6);
});

test('signalQueue: does not pad when the bank holds fewer questions', () => {
  const insights = { words: [{ word: 'solo' }] };
  const questions = [
    q('solo-f1', { text_it: 'Solo i taxi', is_true: false }),
    q('solo-t1', { text_it: 'Solo questo', is_true: true }),
    q('solo-t2', { text_it: 'Solo il gatto', is_true: true }),
  ];
  const order = signalQueue(questions, insights, 20, rand32());
  assert.equal(order.length, 3);
  assert.equal(new Set(order.map((x) => x.id)).size, 3);
});

test('signalSpans: marks the first occurrence of the signal word', () => {
  const segs = signalSpans('Solo i taxi possono', ['solo']);
  assert.deepEqual(segs, [
    { text: 'Solo', mark: true },
    { text: ' i taxi possono', mark: false },
  ]);
});

test('signalSpans: ignores accents and case, keeps original text', () => {
  const segs = signalSpans('La città è chiusa', ['città']);
  assert.deepEqual(segs, [
    { text: 'La ', mark: false },
    { text: 'città', mark: true },
    { text: ' è chiusa', mark: false },
  ]);
});

test('signalSpans: does not match substrings inside other words', () => {
  const segs = signalSpans('Il sole splende', ['solo']);
  assert.deepEqual(segs, [{ text: 'Il sole splende', mark: false }]);
});

test('signalSpans: empty text or no words yields one plain segment', () => {
  assert.deepEqual(signalSpans('', ['solo']), [{ text: '', mark: false }]);
  assert.deepEqual(signalSpans('Mai qui', []), [{ text: 'Mai qui', mark: false }]);
});

test('attemptedCount: sums correct and wrong across all answer records', () => {
  assert.equal(attemptedCount({}), 0);
  assert.equal(attemptedCount(null), 0);
  const answers = {
    a: { correct: 2, wrong: 1 },
    b: { correct: 0, wrong: 3 },
    broken: 'junk',
  };
  assert.equal(attemptedCount(answers), 6);
});

test('signalHintsEnabled: on/off win over the auto threshold', () => {
  assert.equal(signalHintsEnabled({ signalHints: 'on' }, {}), true);
  assert.equal(signalHintsEnabled({ signalHints: 'off' }, { a: { correct: 500, wrong: 0 } }), false);
});

test('signalHintsEnabled: auto is on below the limit and off at or above it', () => {
  const under = {};
  for (let i = 0; i < SIGNAL_HINTS_AUTO_LIMIT - 1; i++) under[`q${i}`] = { correct: 1, wrong: 0 };
  const at = { ...under, qLast: { correct: 1, wrong: 0 } };
  assert.equal(signalHintsEnabled({ signalHints: 'auto' }, under), true, '99 answers: still on');
  assert.equal(signalHintsEnabled({ signalHints: 'auto' }, at), false, '100 answers: switched off');
});

test('signalHintsEnabled: missing or legacy value behaves as auto', () => {
  assert.equal(signalHintsEnabled({}, {}), true, 'missing field defaults to auto');
  assert.equal(signalHintsEnabled({ signalHints: 'always' }, {}), true, 'unknown value falls back to auto');
  assert.equal(signalHintsEnabled(null, { a: { correct: SIGNAL_HINTS_AUTO_LIMIT, wrong: 0 } }), false);
});

test('mistakeCauses: tags each current mistake with signal/sign/number/rule', () => {
  const questions = [
    { id: 't-1', text_it: 'La velocità è sempre di 50 km/h', is_true: false, image_url: null },
    { id: 't-2', text_it: 'Il segnale raffigurato', is_true: true, image_url: '/images/1.png' },
    { id: 't-3', text_it: 'Il conducente deve rallentare', is_true: false, image_url: null },
    { id: 't-4', text_it: 'Solo i vigili regolano', is_true: true, image_url: '/images/2.png' },
    { id: 't-5', text_it: 'Mai superato limite', is_true: false, image_url: null },
    // not a current mistake — excluded
    { id: 't-6', text_it: 'Punto 5', is_true: true, image_url: null },
  ];
  const answers = {
    't-1': { correct: 0, wrong: 1, lastCorrect: false },
    't-2': { correct: 0, wrong: 1, lastCorrect: false },
    't-3': { correct: 0, wrong: 1, lastCorrect: false },
    't-4': { correct: 0, wrong: 2, lastCorrect: false },
    't-5': { correct: 0, wrong: 1, lastCorrect: false },
    't-6': { correct: 1, wrong: 1, lastCorrect: true },
  };
  const insights = { words: [{ word: 'sempre' }, { word: 'mai' }, { word: 'solo' }] };
  const { perQuestion, counts } = mistakeCauses(answers, questions, insights, null);
  assert.equal(perQuestion.length, 5, 'only current mistakes are tagged');
  const byId = new Map(perQuestion.map((p) => [p.questionId, p.causes]));
  // signal + number
  assert.deepEqual([...byId.get('t-1')].sort(), ['number', 'signal']);
  // sign only
  assert.deepEqual(byId.get('t-2'), ['sign']);
  // rule — no specific cause
  assert.deepEqual(byId.get('t-3'), ['rule']);
  // signal + sign (several causes may apply)
  assert.deepEqual([...byId.get('t-4')].sort(), ['sign', 'signal']);
  // signal only
  assert.deepEqual(byId.get('t-5'), ['signal']);
  assert.deepEqual(counts, { signal: 3, sign: 2, number: 1, rule: 1 });
});

test('mistakeCauses: empty or null inputs produce empty result', () => {
  assert.deepEqual(mistakeCauses({}, [], null, null), { perQuestion: [], counts: { signal: 0, sign: 0, number: 0, rule: 0 } });
  assert.deepEqual(mistakeCauses(null, null, null, null), { perQuestion: [], counts: { signal: 0, sign: 0, number: 0, rule: 0 } });
});

// --- L5a — learning path model ------------------------------------------------

const ALL_CHAPTERS = Object.keys(lessons.chapters);

test('learningPath: one step per lesson chapter, ordered by PATH_ORDER then number', () => {
  const { steps } = learningPath({}, manifest, lessons);
  assert.equal(steps.length, ALL_CHAPTERS.length);
  // core sequence comes first
  assert.deepEqual(steps.slice(0, 9).map((s) => s.id), ['ch1', 'ch2', 'ch3', 'ch4', 'ch5', 'ch6', 'ch7', 'ch8', 'ch9']);
  assert.deepEqual(steps.slice(9, 11).map((s) => s.id), ['ch12', 'ch13']);
  // tail: the rest in chapter-number order
  const tail = steps.slice(11).map((s) => s.id);
  assert.deepEqual(tail, [...tail].sort((a, b) => Number(a.slice(3)) - Number(b.slice(3))));
});

test('learningPath: fresh progress — ch1 is ready, nothing done, not exam-ready', () => {
  const p = learningPath({ answers: {}, theoryRead: [] }, manifest, lessons);
  assert.equal(p.currentIndex, 0);
  assert.equal(p.ready, false);
  assert.equal(p.steps[0].id, 'ch1');
  assert.equal(p.steps[0].status, 'ready');
  assert.ok(p.steps.slice(1).every((s) => s.status === 'open'));
  assert.equal(p.steps[0].name, manifest.categories.find((c) => c.slug === 'definizioni-generali-doveri-strada').name);
});

test('learningPath: read lesson marks the step done', () => {
  const p = learningPath({ answers: {}, theoryRead: ['ch2'] }, manifest, lessons);
  const step = p.steps.find((s) => s.id === 'ch2');
  assert.equal(step.read, true);
  assert.equal(step.status, 'done');
  // ch1 still the first not-done step
  assert.equal(p.currentIndex, 0);
  assert.equal(p.steps[0].status, 'ready');
});

test('learningPath: mini-check >= 4/5 marks the step done (3 is not enough)', () => {
  const atPass = learningPath({ answers: {}, theoryRead: [], chapters: { ch3: { check: PATH_MINI_PASS } } }, manifest, lessons);
  assert.equal(atPass.steps.find((s) => s.id === 'ch3').status, 'done');
  const belowPass = learningPath({ answers: {}, theoryRead: [], chapters: { ch3: { check: PATH_MINI_PASS - 1 } } }, manifest, lessons);
  assert.equal(belowPass.steps.find((s) => s.id === 'ch3').status, 'open');
});

test('learningPath: mastery >= 80% of the topic bank marks the step done', () => {
  const slug = 'definizioni-generali-doveri-strada';
  const count = manifest.categories.find((c) => c.slug === slug).count;
  const enough = Math.ceil((PATH_MASTERY_PCT / 100) * count);
  const ok = (n) => Object.fromEntries(
    Array.from({ length: n }, (_, i) => [`${slug}-q${i}`, { correct: 1, wrong: 0, lastCorrect: true }]),
  );
  const done = learningPath({ answers: ok(enough), theoryRead: [] }, manifest, lessons);
  assert.equal(done.steps[0].status, 'done');
  assert.equal(done.steps[0].masteryPct, PATH_MASTERY_PCT);
  const notDone = learningPath({ answers: ok(enough - 1), theoryRead: [] }, manifest, lessons);
  // 424/531 = 79.85% → still not done (the exact threshold, not the rounded display)
  assert.equal(notDone.steps[0].status, 'ready');
});

test('learningPath: all steps done → currentIndex -1, ready true', () => {
  const p = learningPath({ answers: {}, theoryRead: [...ALL_CHAPTERS] }, manifest, lessons);
  assert.equal(p.ready, true);
  assert.equal(p.currentIndex, -1);
  assert.ok(p.steps.every((s) => s.status === 'done'));
});

test('learningPath: tolerates missing/null inputs without throwing', () => {
  const p = learningPath(null, null, null);
  assert.equal(p.steps.length, 0);
  assert.equal(p.ready, false, 'no chapters is not "all steps done"');
  assert.equal(p.empty, true);
  assert.equal(p.currentIndex, -1);
});

test('learningPath: unknown chapters (e.g. ch99 in theoryRead) are never produced as steps', () => {
  const { steps } = learningPath({ answers: {}, theoryRead: ['ch99'] }, manifest, lessons);
  assert.ok(steps.every((s) => ALL_CHAPTERS.includes(s.id)));
  assert.equal(steps.length, ALL_CHAPTERS.length);
});

// ---- L5b: "Continue" action (first missing part) + check score domain ----

test('nextStepAction: read → check → practice, in order', () => {
  assert.equal(nextStepAction(null), null);
  assert.equal(nextStepAction({ read: false, check: 0, slug: 'segno-obbligo' }), 'read');
  assert.equal(nextStepAction({ read: true, check: 0, slug: 'segno-obbligo' }), 'check');
  assert.equal(nextStepAction({ read: true, check: 3, slug: 'segno-obbligo' }), 'check');
  assert.equal(nextStepAction({ read: true, check: 4, slug: 'segno-obbligo' }), 'practice');
  assert.equal(nextStepAction({ read: true, check: 5, slug: 'segno-obbligo' }), 'practice');
  // A step whose topic has no question bank cannot be practiced.
  assert.equal(nextStepAction({ read: true, check: 4, slug: null }), null);
});

test('learningPath: a perfect 5/5 check is stored and passes the step', () => {
  const { steps } = learningPath(
    { answers: {}, theoryRead: ['ch1'], chapters: { ch1: { check: 5 } } },
    manifest,
    lessons,
  );
  const ch1 = steps.find((s) => s.id === 'ch1');
  assert.equal(ch1.check, 5);
  assert.ok(ch1.done);
  assert.equal(nextStepAction(ch1), 'practice');
});

test('learningPath: continue target — fresh step is read', () => {
  const { steps } = learningPath({ answers: {}, theoryRead: [], chapters: {} }, manifest, lessons);
  // First step is 'ready' and unread → continue means "read".
  assert.equal(nextStepAction(steps[0]), 'read');
});

// --- L7 — exam readiness ------------------------------------------------------

test('examReadiness: below 150 distinct answers → not ready', () => {
  const r = examReadiness({ 'segnali-precedenza-a': { correct: 1, wrong: 0, lastCorrect: true } }, manifest.categories);
  assert.equal(r.ready, false);
  assert.equal(r.answers, 1);
  assert.equal(r.needed, EXAM_READINESS_MIN_ANSWERS);
});

test('examReadiness: perfect learner → > 95%', () => {
  // Covers every category; enough volume that Laplace smoothing stops
  // dominating, so the estimate reflects real mastery.
  const answers = {};
  for (const cat of manifest.categories) {
    for (let i = 0; i < 30; i++) {
      answers[`${cat.slug}-q${i}`] = { correct: 1, wrong: 0, lastCorrect: true };
    }
  }
  assert.equal(Object.keys(answers).length, manifest.categories.length * 30);
  const r = examReadiness(answers, manifest.categories);
  assert.equal(r.ready, true);
  assert.ok(r.passPct > 95, `expected > 95%, got ${r.passPct}`);
});

test('examReadiness: ~50% error learner → < 1%', () => {
  const answers = {};
  let n = 0;
  for (const cat of manifest.categories) {
    for (let i = 0; i < 12 && n < 200; i++) {
      const wrong = n % 2 === 0;
      answers[`${cat.slug}-q${i}`] = { correct: wrong ? 0 : 1, wrong: wrong ? 1 : 0, lastCorrect: !wrong };
      n++;
    }
  }
  const r = examReadiness(answers, manifest.categories);
  assert.equal(r.ready, true);
  assert.ok(r.passPct < 1, `expected < 1%, got ${r.passPct}`);
});

test('examReadiness: biggestGain names the weakest topic', () => {
  const answers = {};
  const weak = manifest.categories[1];
  for (const cat of manifest.categories) {
    for (let i = 0; i < 30; i++) {
      // Weak topic: only 3 of 30 correct. Every other topic: 27 of 30 correct.
      const wrong = cat.slug === weak.slug ? i >= 3 : i >= 27;
      answers[`${cat.slug}-q${i}`] = { correct: wrong ? 0 : 1, wrong: wrong ? 1 : 0 };
    }
  }
  const r = examReadiness(answers, manifest.categories);
  assert.equal(r.ready, true);
  assert.ok(r.biggestGain, 'expected a biggest gain topic');
  assert.equal(r.biggestGain.slug, weak.slug);
  assert.ok(r.biggestGain.gainPct >= 1);
});

test('learningPath: no chapters is NOT "all done" (was "the whole 0-step path")', async () => {
  const { learningPath } = await import('../public/js/domain/learning.js');
  const path = learningPath({ answers: {}, theoryRead: [], chapters: {} }, { categories: [] }, { chapters: {} });
  assert.equal(path.steps.length, 0);
  assert.equal(path.empty, true);
  assert.equal(path.ready, false);
  const missing = learningPath({ answers: {} }, { categories: [] }, null);
  assert.equal(missing.ready, false);
  assert.equal(missing.empty, true);
});

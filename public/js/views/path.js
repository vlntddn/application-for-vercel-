/**
 * L5b — the learning path screen (route #/path).
 *
 * One card per lesson chapter, in recommended order (PATH_ORDER first, then
 * the rest by number). Each card shows "Step N of 25 — Title" and the
 * Read → Check → Practice pipeline, plus a single Continue button that jumps
 * to the first part of the step the learner has not finished yet.
 */
import { state, loadLessons } from '../state.js';
import { el, clear, svgIcon } from '../ui.js';
import { errorBanner, loc } from './common.js';
import { learningPath, nextStepAction, PATH_MINI_PASS } from '../domain/learning.js';

/**
 * Where the learner's next tap should land for a step: the first missing
 * part of the pipeline. `read` → the lesson, `check` → the lesson with the
 * self-check started, `practice` → the topic's question bank.
 */
export function pathContinueTarget(step) {
  const action = nextStepAction(step);
  if (action === 'read') return `#/theory/${step.id}`;
  if (action === 'check') return `#/theory/${step.id}/check`;
  if (action === 'practice') return `#/practice/${step.slug}`;
  return `#/theory/${step.id}`;
}

/**
 * The three pipeline parts with their done state, left → right. Practice is
 * "done" only by topic mastery — the step being done via read or check does
 * not count as practicing, since those are separate actions.
 */
function pipeline(step) {
  const practiceDone = step.done && !step.read && step.check < PATH_MINI_PASS;
  return [
    { key: 'read', label: 'Read', done: !!step.read },
    { key: 'check', label: 'Check', done: step.check >= PATH_MINI_PASS },
    { key: 'practice', label: 'Practice', done: practiceDone },
  ];
}

function partIcon(part, active) {
  const cls = part.done ? 'path-part__icon path-part__icon--done'
    : active ? 'path-part__icon path-part__icon--active' : 'path-part__icon';
  return el('span', { className: cls }, part.done ? svgIcon('check') : null);
}

function stepCard(step, index, total) {
  const parts = pipeline(step);
  const action = nextStepAction(step);
  const target = pathContinueTarget(step);
  const isNew = step.status === 'ready';
  const isDone = step.status === 'done';
  return el('div.ds-card', { className: 'path-card', id: `path-step-${step.id}` },
    el('div.ds-card__top', {},
      el('span.ds-card__eyebrow', {}, `Step ${index + 1} of ${total}`),
      isDone ? el('span.ds-tag', { className: 'ds-tag--ok' }, svgIcon('check'), 'Done')
        : isNew ? el('span.ds-tag', { className: 'ds-tag--accent' }, 'Up next')
          : el('span.ds-tag', {}, 'Not started'),
    ),
    el('h3.ds-card__title', {}, step.name),
    el('div.path-pipeline', {},
      ...parts.map((part, i) => el('div', { className: 'path-part-wrap', key: part.key },
        partIcon(part, action === part.key),
        el('span', { className: `path-part__label${action === part.key ? ' path-part__label--active' : ''}` }, part.label),
        i < parts.length - 1 ? el('span', { className: 'path-part__sep' }) : null,
      )),
    ),
    isDone
      ? null
      : el('a.ds-btn.ds-btn--primary.ds-btn--lg', { href: target },
          action === 'practice' ? 'Practice the topic' : `Continue — ${action}`),
  );
}

/**
 * The learning-path link card shown first on the dashboard: where the
 * learner is now (step N of 25, current title) and one Continue action.
 */
export function pathLinkCard() {
  const lessons = state.lessons;
  if (!lessons) return null;
  const path = learningPath(state.progress, state.manifest, lessons);
  const total = path.steps.length;
  if (path.ready) {
    return el('div.ds-card', { id: 'dashboard-learning-path' },
      el('div.ds-card__top', {},
        el('span.ds-card__eyebrow', {}, 'Learning path'),
        el('span.ds-tag', { className: 'ds-tag--ok' }, svgIcon('check'), 'Complete'),
      ),
      el('h3.ds-card__title', {}, 'All steps done'),
      el('p.ds-card__sub', {}, `You finished the whole ${total}-step path. Go take a mock exam.`),
      el('a.ds-btn.ds-btn--primary.ds-btn--lg', { href: '#/exam' }, 'Start a mock exam'),
    );
  }
  const idx = path.currentIndex;
  const step = path.steps[idx];
  const doneCount = path.steps.filter((s) => s.status === 'done').length;
  return el('div.ds-card', { id: 'dashboard-learning-path' },
    el('div.ds-card__top', {},
      el('span.ds-card__eyebrow', {}, 'Learning path'),
      el('span.ds-tag', {}, `${doneCount} of ${total} done`),
    ),
    el('h3.ds-card__title', {}, `Step ${idx + 1} of ${total} — ${step.name}`),
    el('p.ds-card__sub', {}, 'Read → Check → Practice, one chapter at a time.'),
    el('a.ds-btn.ds-btn--primary.ds-btn--lg', { href: pathContinueTarget(step) },
      nextStepAction(step) === 'practice' ? 'Continue — Practice' : 'Continue'),
  );
}

export async function renderPath(root) {
  let lessons;
  try {
    lessons = await loadLessons();
  } catch (err) {
    return clear(root, errorBanner(err));
  }
  const path = learningPath(state.progress, state.manifest, lessons);
  const total = path.steps.length;
  const doneCount = path.steps.filter((s) => s.status === 'done').length;
  clear(root,
    el('h1', {}, 'THE LEARNING PATH'),
    el('p.lede', {}, `Study one chapter at a time: read it, pass a 5-question check, then practice the topic. ${total} steps to the exam.`),
    el('div.panel', { style: 'margin-bottom:24px' },
      el('div.bar', { 'aria-hidden': 'true' }, el('div', { style: `width:${total ? Math.round((doneCount / total) * 100) : 0}%` })),
      el('p.stat-sub', {}, `${doneCount} of ${total} steps done`),
    ),
    el('div.path-list', {},
      ...path.steps.map((step, i) => stepCard(step, i, total)),
    ),
  );
}

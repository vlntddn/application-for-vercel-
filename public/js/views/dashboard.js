import { state, loadLessons } from '../state.js';
import { el, clear, fmtDate, svgIcon } from '../ui.js';
import { pathLinkCard, pathContinueTarget } from './path.js';
import { topicLabel } from '../topics.js';
import { detectMode, MODE } from '../api.js';
import { isInstalled } from '../install.js';
import {
  dailyGoal, categoryStats, PRACTICE_BATCH,
  shouldSuggestBackup, readLastBackup, readBackupDismissed,
  writeBackupDismissed, exportProgressSnapshot,
  shouldSuggestInstallReminder, readInstallDismissed, writeInstallDismissed,
  readDailyReminderDismissed, writeDailyReminderDismissed,
} from './common.js';
import { dayKey, weekStrip } from './widgets.js';
import { examReadiness, learningPath, nextStepAction } from '../domain/learning.js';
import { shouldRemind } from '../domain/progress.js';
import { t } from '../i18n.js';

const EXAM_QUESTIONS = 30;
const EXAM_SECONDS = 20 * 60;
const EXAM_MAX_ERRORS = 3;
const REVIEW_SIZE = 10;


/**
 * GoalRing (design system): 112px ring, ink outline as the 3:1 boundary,
 * sunken track, accent arc from twelve o'clock. The numbers stay as text —
 * the arc is the secondary cue.
 */
export function progressRing(current, goal, { size = 112, label = '' } = {}) {
  const pct = goal > 0 ? Math.max(0, Math.min(100, (current / goal) * 100)) : 0;
  const r = 48;
  const circumference = 2 * Math.PI * r;
  const svgNS = 'http://www.w3.org/2000/svg';

  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  svg.setAttribute('aria-hidden', 'true');

  for (const [cls, sw] of [['ds-ring__edge', 16], ['ds-ring__track', 10], ['ds-ring__value', 10]]) {
    const circle = document.createElementNS(svgNS, 'circle');
    circle.setAttribute('cx', size / 2);
    circle.setAttribute('cy', size / 2);
    circle.setAttribute('r', r);
    circle.setAttribute('class', cls);
    circle.setAttribute('stroke-width', sw);
    svg.append(circle);
  }
  const value = svg.querySelector('.ds-ring__value');
  value.setAttribute('stroke-dasharray', `${circumference.toFixed(2)}`);
  value.setAttribute('stroke-dashoffset', `${(circumference * (1 - pct / 100)).toFixed(2)}`);

  const wrap = el('div.ds-ring', {
    role: 'img',
    'aria-label': label ? `${label} — ${t('db.ring.aria', { current, goal })}` : t('db.ring.aria', { current, goal }),
  },
    svg,
    el('div.ds-ring__centre', {},
      el('span.ds-ring__num', {}, String(current)),
      el('span.ds-ring__sub', {}, current >= goal && goal > 0 ? t('db.ring.goalMet') : t('db.ring.of', { goal })),
    ),
  );
  return wrap;
}

/** Stat card (design system): uppercase label, 44px value, one sub line. */
function statCard(label, value, { valueClass = '', sub } = {}) {
  return el('div.ds-stat', {},
    el('span.ds-stat__label', {}, label),
    el('span.ds-stat__value', { className: valueClass ? `ds-stat__value ${valueClass}` : 'ds-stat__value' }, value),
    el('p.ds-stat__sub', {}, sub),
  );
}

/**
 * Dashboard stats for an active user: week strip (ds-week) + goal ring
 * (ds-ring) in one panel, then three Stat cards (design system). A
 * newcomer (0 answers) gets none of this — raw zeros are a wall, not
 * a dashboard.
 */
function statsRow(week, daysThisWeek, answeredToday, goal, stats, total) {
  const masteredPct = Math.round((stats.mastered / total) * 100);
  const weekDays = week.map((day) =>
    el('div.ds-week__day', { className: day.isToday ? 'ds-week__day--today' : '' },
      el('span.ds-week__cell', {
        className: `ds-week__cell${day.studied ? ' ds-week__cell--done' : ''}${day.isToday ? ' ds-week__cell--today' : ''}`,
        role: 'img',
        'aria-label': day.isToday
          ? t('db.week.todayAria', { day: day.label, answered: answeredToday, goal })
          : t(day.studied ? 'db.week.metAria' : 'db.week.noneAria', { day: day.label }),
      }, day.studied ? svgIcon('check') : null),
      el('span.ds-week__label', {}, day.label),
    ));
  return el('div', {},
    el('div.panel.week-panel', {},
      el('div.quiz-head', { style: 'margin-bottom:12px' },
        el('h2', { style: 'margin:0' }, t('db.week.title')),
        el('span.tag', { className: `tag ${daysThisWeek >= 5 ? 'ok' : ''}` },
          t('db.week.days', { n: daysThisWeek })),
      ),
      el('div.week-row', {},
        el('div.ds-week', {
          role: 'img',
          'aria-label': t('db.week.aria', { n: daysThisWeek }),
        }, ...weekDays),
        // The ring tracks today's goal — mastery of 7139 questions would
        // sit near zero for weeks and read as broken.
        el('div.today-goal', {},
          progressRing(answeredToday, goal),
          el('span.ds-week__label', {}, answeredToday >= goal && goal > 0 ? t('db.ring.goalMet') : t('db.ring.today')),
        ),
      ),
    ),
    el('div.ds-stat-row', { 'data-testid': 'dashboard-stats' },
      statCard(t('db.stat.streak'), String(stats.streak), {
        valueClass: 'ds-stat__value--streak',
        sub: stats.streak === 1 ? t('db.stat.streakOne') : t('db.stat.streakMany'),
      }),
      statCard(t('db.stat.mastered'), String(stats.mastered), {
        valueClass: 'ds-stat__value--ok',
        sub: t('db.stat.masteredSub', { total, pct: masteredPct }),
      }),
      statCard(t('db.stat.examSuccess'), `${stats.examSuccess}%`, {
        sub: t('db.stat.examSub', { passed: stats.examsPassed, taken: stats.examsTaken }),
      }),
    ),
  );
}

/**
 * Dashboard next-step for a newcomer: no raw numbers — one large action,
 * first below the greeting. Shown until the first answer is recorded.
 */
export function nextStepsPanel() {
  return el('div.ds-card', { id: 'dashboard-next-steps' },
    el('div.ds-card__top', {},
      el('span.ds-card__eyebrow', {}, t('db.next.eyebrow')),
      el('span.ds-tag', {}, t('db.next.tag', { n: PRACTICE_BATCH })),
    ),
    el('h3.ds-card__title', {}, t('db.next.title')),
    el('p.ds-card__sub', {}, t('db.next.sub', { n: PRACTICE_BATCH })),
    // U1 — one primary per screen: the path card above carries the primary
    // (Continue); this card's Start practice is a regular button.
    el('a.ds-btn.ds-btn--lg', { href: '#/practice' }, t('db.next.btn')),
  );
}

/**
 * L6b — spaced-repetition nudge: how many cards are due today, with the
 * review as the action. Hidden until at least one card is due (and for
 * newcomers, who have no review history yet).
 */
export function reviewDuePanel() {
  const due = state.progress.stats.reviewDue;
  if (!due) return null;
  return el('div.ds-card', { id: 'dashboard-review-due' },
    el('div.ds-card__top', {},
      el('span.ds-card__eyebrow', {}, t('db.review.eyebrow')),
      el('span.ds-tag', {}, t('db.review.tag')),
    ),
    el('h3.ds-card__title', {}, t(due > 1 ? 'db.review.titleMany' : 'db.review.titleOne', { n: due })),
    el('p.ds-card__sub', {}, t('db.review.sub')),
    el('a.ds-btn.ds-btn--primary', { href: '#/review' }, t('db.review.btn')),
  );
}

/**
 * "Chance to pass now" panel (L7). Shown once the learner has at least
 * EXAM_READINESS_MIN_ANSWERS distinct answers. The estimate is honest — it
 * says so in the caption. `biggestGain` names the topic whose improvement to
 * 90% mastery lifts the estimate the most.
 */
export function examReadinessPanel() {
  const r = examReadiness(state.progress.answers, state.manifest.categories);
  if (!r.ready) return null;
  const gain = r.biggestGain;
  return el('div.ds-card', { id: 'dashboard-exam-readiness' },
    el('div.ds-card__top', {},
      el('span.ds-card__eyebrow', {}, t('db.exready.eyebrow')),
      el('span.ds-tag', {}, r.passPct >= 70 ? t('db.exready.tagReady') : t('db.exready.tagWorking')),
    ),
    el('h3.ds-card__title', {}, t('db.exready.title', { pct: r.passPct })),
    gain
      ? el('p.ds-card__sub', {},
          t('db.exready.gain', { topic: topicLabel({ slug: gain.slug, name: gain.name }), pct: gain.gainPct }))
      : null,
    el('p.ds-card__sub', { style: 'opacity:.65;font-size:.82em' },
      t('db.exready.caption')),
  );
}

/**
 * "Until the exam" panel: what to fix next, computed from real data —
 * the weakest attempted topics (accuracy < 70%) and pending mistakes.
 * Shown once at least one mock exam exists.
 */
export function weakSpotsPanel() {
  const { exams } = state.progress;
  const last = exams[exams.length - 1];
  const weak = categoryStats()
    .filter((c) => c.attempted && c.accuracy < 70)
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, 3);
  return el('div.panel', { id: 'dashboard-exam-readiness' },
    el('div.quiz-head', { style: 'margin-bottom:12px' },
      el('h2', { style: 'margin:0' }, t('db.weak.title')),
      el('span.tag', { className: `tag ${last.passed ? 'ok' : 'bad'}` },
        t('db.weak.last', { errors: last.errors, verdict: t(last.passed ? 'db.weak.passed' : 'db.weak.failed') })),
    ),
    weak.length
      ? el('div', {},
          ...weak.map((c) =>
            el('div.row', {},
              el('span', {}, topicLabel(c)),
              el('span.tag', { className: 'tag bad' }, `${c.accuracy}%`),
            ),
          ),
        )
      : el('p.empty-note', {}, t('db.weak.none')),
    el('div.actions', {},
      weak.length
        ? el('a.btn.btn-primary', { href: `#/practice/${weak[0].slug}` },
            t('db.weak.strengthen', { topic: topicLabel(weak[0]) }))
        : el('a.btn.btn-primary', { href: '#/exam' }, t('db.weak.another')),
      state.progress.stats.mistakes > 0
        ? el('a.btn', { href: '#/mistakes' }, t('db.weak.review', { n: state.progress.stats.mistakes }))
        : null,
    ),
  );
}

/**
 * Q5 — dashboard actions: ONE primary CTA (continue the path; a user who
 * finished the whole path gets the mock exam) above a 2×3 grid of
 * secondary tiles (icon + label). No button wall.
 */
function actionsPanel(stats) {
  // Same target the learning-path card points at — one primary, same intent.
  const lessons = state.lessons;
  const path = lessons ? (() => { try { return learningPath(state.progress, state.manifest, lessons); } catch { return null; } })() : null;
  let cta;
  if (path && path.ready) {
    cta = el('a.ds-btn.ds-btn--primary.ds-btn--lg', { href: '#/exam' }, t('db.actions.examCta'));
  } else if (path) {
    const step = path.steps[path.currentIndex];
    const target = pathContinueTarget(step);
    cta = el('a.ds-btn.ds-btn--primary.ds-btn--lg', { href: target },
      nextStepAction(step) === 'practice'
        ? t('pth.cardContinuePractice')
        : t('pth.cardContinue'));
  } else {
    // No lessons loaded yet — path card is absent, CTA falls back to practice.
    cta = el('a.ds-btn.ds-btn--primary.ds-btn--lg', { href: '#/practice' }, t('db.actions.practice'));
  }
  const tiles = [
    { icon: 'check', href: '#/review', label: t('db.actions.quickReview', { n: REVIEW_SIZE }) },
    { icon: 'grid', href: '#/practice', label: t('db.actions.practice') },
    { icon: 'star', href: '#/drill/signals', label: t('db.actions.drill') },
    { icon: 'hash', href: '#/numbers', label: t('db.actions.numbers') },
    { icon: 'book', href: '#/theory', label: t('db.actions.theory') },
    { icon: 'chart', href: '#/stats', label: t('db.actions.stats') },
  ];
  if (stats.mistakes > 0) {
    // Replace the grid's last tile so the count stays visible — the grid
    // stays 2 columns, no 7th tile dangling.
    tiles[tiles.length - 1] = { icon: 'cross', href: '#/mistakes', label: t('db.actions.mistakes', { n: stats.mistakes }) };
  }
  return el('div.panel', { id: 'dashboard-actions' },
    el('div.quiz-head', { style: 'margin-bottom:12px' },
      el('h2', { style: 'margin:0' }, t('db.actions.title')),
      el('span.tag', {}, t('db.actions.sub', { n: EXAM_QUESTIONS, min: EXAM_SECONDS / 60, errors: EXAM_MAX_ERRORS })),
    ),
    cta,
    el('div.action-tiles', {},
      ...tiles.map((tile) =>
        el('a.action-tile', { href: tile.href },
          el('span.action-tile__icon', {}, svgIcon(tile.icon)),
          el('span.action-tile__label', {}, tile.label),
        )),
    ),
  );
}

/**
 * Backup reminder (S2.8a3): enough answers + no fresh backup → one callout
 * with Export as the action; "Not now" hides it for a week (localStorage).
 */
export function backupReminderPanel() {
  if (!shouldSuggestBackup(state.progress.stats, readLastBackup(), readBackupDismissed(), Date.now())) {
    return null;
  }
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'ic');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  // shield: progress is safe only on this device
  const path = document.createElementNS(svgNS, 'path');
  path.setAttribute('d', 'M12 3l8 3v6c0 4.5-3.2 7.7-8 9-4.8-1.3-8-4.5-8-9V6z');
  svg.append(path);
  return el('div.ds-callout', { id: 'backup-reminder' },
    el('div.ds-callout__icon', {}, svg),
    el('div.ds-callout__body', {},
      el('span.ds-callout__title', {}, t('db.backup.title')),
      el('p.ds-callout__text', {}, t('db.backup.text')),
    ),
    el('div.ds-callout__action', {},
      el('button.btn.btn-primary', { onclick: (e) => { exportProgressSnapshot(); e.target.closest('.ds-callout').remove(); } }, t('db.backup.export')),
      el('button.btn', { onclick: (e) => { writeBackupDismissed(); e.target.closest('.ds-callout').remove(); } }, t('db.backup.later')),
    ),
  );
}

/**
 * iOS install reminder (S2.8a4): standalone mode + uninstalled iPhone/iPad
 * Safari → one callout per week pointing at the Settings instructions.
 */
export function installReminderPanel() {
  // Server mode: progress lives on the server, Safari can't erase it.
  if (detectMode() !== MODE.standalone) return null;
  // isInstalled() is the iOS Home-Screen signal (navigator.standalone /
  // display-mode:standalone); only nudge users who have NOT added the app.
  if (!shouldSuggestInstallReminder(navigator.userAgent, isInstalled(), readInstallDismissed(), Date.now())) {
    return null;
  }
  return el('div.ds-callout', { id: 'install-reminder' },
    el('div.ds-callout__icon.ds-callout__icon--bad', {}, svgIcon('warn')),
    el('div.ds-callout__body', {},
      el('span.ds-callout__title', {}, t('db.install.title')),
      el('p.ds-callout__text', {},
        t('db.install.text'),
        el('a', { href: '#/settings' }, t('db.install.how')),
      ),
    ),
    el('div.ds-callout__action', {},
      el('button.btn', { onclick: (e) => { writeInstallDismissed(); e.target.closest('.ds-callout').remove(); } }, t('db.install.later')),
    ),
  );
}

/**
 * S3.6 — in-app nudge: goal not reached today AND away for ≥ 12h. In-app only
 * (no push, per owner). The cross closes it for the rest of the day; the
 * banner comes back the next day on its own.
 */
export function dailyGoalReminderPanel() {
  if (!shouldRemind(state.progress)) return null;
  const today = dayKey(new Date());
  if (readDailyReminderDismissed() === today) return null;
  // START goes to quick review when something is due (that is the natural
  // "get back in" path), otherwise to practice.
  const startHref = (state.progress.stats?.reviewDue ?? 0) > 0 ? '#/review' : '#/practice';
  const close = (e) => {
    writeDailyReminderDismissed(today);
    e.target.closest('.ds-callout')?.remove();
  };
  return el('div.ds-callout', { id: 'daily-reminder' },
    el('div.ds-callout__icon', {}, svgIcon('warn')),
    el('div.ds-callout__body', {},
      el('span.ds-callout__title', {}, t('db.remd.title', { done: state.progress.dailyAnswers?.[today] ?? 0, goal: dailyGoal() })),
      el('p.ds-callout__text', {}, t('db.remd.text')),
    ),
    el('div.ds-callout__action', {},
      el('a.ds-btn.ds-btn--primary', { href: startHref }, t('db.remd.start')),
      el('button.ds-callout__close', { 'aria-label': t('db.remd.closeAria'), onclick: close }, svgIcon('x')),
    ),
  );
}

export async function renderDashboard(root) {
  const { profile, stats, exams } = state.progress;
  const total = state.manifest.totalQuestions;
  const recentExams = [...exams].slice(-5).reverse();

  const week = weekStrip(state.progress.activeDays);
  const daysThisWeek = week.filter((d) => d.studied).length;
  const answeredToday = state.progress.dailyAnswers?.[dayKey(new Date())] ?? 0;
  const goal = dailyGoal();

  // L5b — the learning path is the spine of the app, so its link card is the
  // first thing on the dashboard. The card needs the lesson list (the path
  // model runs over chapters), which is lazy-loaded here.
  let pathCard = null;
  try {
    state.lessons = await loadLessons();
    pathCard = pathLinkCard();
  } catch {
    pathCard = null; // no lessons → no path card; the rest of the dashboard is fine
  }

  clear(root,
    el('h1', {}, profile.name ? t('db.greetingName', { name: profile.name }) : t('db.greeting')),
    el('p.lede', {}, t('db.lede')),
    // Q5: single column, 24px gap between sections — the gap is the
    // only thing separating the cards (no ad-hoc inline margins).
    el('div.dashboard-stack', {},
      // One callout per section: install alert (iOS), then the backup
      // reminder; both sit under the greeting, before the content.
      dailyGoalReminderPanel(),
      installReminderPanel(),
      backupReminderPanel(),
      pathCard,
      // A newcomer gets the next action instead of raw statistics
      // (Phase 2.2); a user with practice history gets the week + goal
      // panel and the Stat cards.
      stats.answered === 0
        ? nextStepsPanel()
        : statsRow(week, daysThisWeek, answeredToday, goal, stats, total),
      stats.answered > 0 ? reviewDuePanel() : null,
      examReadinessPanel(),
      exams.length > 0
        ? weakSpotsPanel()
        : null,
      actionsPanel(stats),
      recentExams.length
        ? el('div.panel', {},
            el('h2', {}, t('db.recent.title')),
            ...recentExams.map((e) =>
              el('div.row', {},
                el('span', {}, fmtDate(e.date)),
                el('span', {}, t('db.recent.errors', { errors: e.errors, total: e.total })),
                el('span.tag', { className: `tag ${e.passed ? 'ok' : 'bad'}` }, t(e.passed ? 'db.recent.passed' : 'db.recent.failed')),
              ),
            ),
          )
        : null,
    ),
  );
}



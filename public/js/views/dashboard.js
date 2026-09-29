import { state } from '../state.js';
import { el, clear, fmtDate, svgIcon } from '../ui.js';
import { topicLabel } from '../topics.js';
import { detectMode, MODE } from '../api.js';
import { isInstalled } from '../install.js';
import {
  dailyGoal, categoryStats, PRACTICE_BATCH,
  shouldSuggestBackup, readLastBackup, readBackupDismissed,
  writeBackupDismissed, exportProgressSnapshot,
  shouldSuggestInstallReminder, readInstallDismissed, writeInstallDismissed,
} from './common.js';
import { dayKey, weekStrip } from './stats.js';

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
    'aria-label': label ? `${current} of ${goal} — ${label}` : `${current} of ${goal}`,
  },
    svg,
    el('div.ds-ring__centre', {},
      el('span.ds-ring__num', {}, String(current)),
      el('span.ds-ring__sub', {}, current >= goal && goal > 0 ? 'Goal met' : `of ${goal}`),
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
        'aria-label': day.isToday ? `${day.label} (today): ${answeredToday} of ${goal} today`
          : `${day.label}: ${day.studied ? 'goal met' : 'no practice'}`,
      }, day.studied ? svgIcon('check') : null),
      el('span.ds-week__label', {}, day.label),
    ));
  return el('div', {},
    el('div.panel.week-panel', {},
      el('div.quiz-head', { style: 'margin-bottom:12px' },
        el('h2', { style: 'margin:0' }, 'This week'),
        el('span.tag', { className: `tag ${daysThisWeek >= 5 ? 'ok' : ''}` },
          `${daysThisWeek}/7 days`),
      ),
      el('div.week-row', {},
        el('div.ds-week', {
          role: 'img',
          'aria-label': `Studied on ${daysThisWeek} of the last 7 days`,
        }, ...weekDays),
        // The ring tracks today's goal — mastery of 7139 questions would
        // sit near zero for weeks and read as broken.
        el('div.today-goal', {},
          progressRing(answeredToday, goal),
          el('span.ds-week__label', {}, answeredToday >= goal && goal > 0 ? 'Goal met' : 'Today'),
        ),
      ),
    ),
    el('div.ds-stat-row', { 'data-testid': 'dashboard-stats' },
      statCard('Login streak', String(stats.streak), {
        valueClass: 'ds-stat__value--streak',
        sub: stats.streak === 1 ? 'Day in a row' : 'Days in a row',
      }),
      statCard('Questions mastered', String(stats.mastered), {
        valueClass: 'ds-stat__value--ok',
        sub: `Of ${total} (${masteredPct}%)`,
      }),
      statCard('Exam success', `${stats.examSuccess}%`, {
        sub: `${stats.examsPassed}/${stats.examsTaken} mock exams passed`,
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
      el('span.ds-card__eyebrow', {}, 'Next step'),
      el('span.ds-tag', {}, `${PRACTICE_BATCH} questions`),
    ),
    el('h3.ds-card__title', {}, 'Start with practice'),
    el('p.ds-card__sub', {},
      `Pick a topic and answer ${PRACTICE_BATCH} VERO / FALSO questions — about 5 minutes. ` +
      `Theory is one tap away when you get stuck.`),
    el('a.ds-btn.ds-btn--primary.ds-btn--lg', { href: '#/practice' }, 'Start practice'),
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
  return el('div.panel', { id: 'dashboard-exam-readiness', style: 'margin-top:24px' },
    el('div.quiz-head', { style: 'margin-bottom:12px' },
      el('h2', { style: 'margin:0' }, 'UNTIL THE EXAM'),
      el('span.tag', { className: `tag ${last.passed ? 'ok' : 'bad'}` },
        `LAST: ${last.errors} ERRORS — ${last.passed ? 'PASSED' : 'FAILED'}`),
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
      : el('p.empty-note', {}, 'No weak topic under 70% — keep the streak alive.'),
    el('div.actions', {},
      weak.length
        ? el('a.btn.btn-primary', { href: `#/practice/${weak[0].slug}` },
            `STRENGTHEN ${topicLabel(weak[0])}`)
        : el('a.btn.btn-primary', { href: '#/exam' }, 'ANOTHER MOCK EXAM'),
      state.progress.stats.mistakes > 0
        ? el('a.btn', { href: '#/mistakes' }, `REVIEW ${state.progress.stats.mistakes} MISTAKES`)
        : null,
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
  return el('div.ds-callout', { id: 'backup-reminder', style: 'margin-top:24px' },
    el('div.ds-callout__icon', {}, svg),
    el('div.ds-callout__body', {},
      el('span.ds-callout__title', {}, 'Backup'),
      el('p.ds-callout__text', {}, 'Save a backup copy — your progress lives only in this browser.'),
    ),
    el('div.ds-callout__action', {},
      el('button.btn.btn-primary', { onclick: (e) => { exportProgressSnapshot(); e.target.closest('.ds-callout').remove(); } }, 'Export'),
      el('button.btn', { onclick: (e) => { writeBackupDismissed(); e.target.closest('.ds-callout').remove(); } }, 'Not now'),
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
  return el('div.ds-callout', { id: 'install-reminder', style: 'margin-top:24px' },
    el('div.ds-callout__icon.ds-callout__icon--bad', {}, svgIcon('warn')),
    el('div.ds-callout__body', {},
      el('span.ds-callout__title', {}, 'iPhone'),
      el('p.ds-callout__text', {},
        'On iPhone, Safari may erase your progress after a week away. Add Passo to your Home Screen. ',
        el('a', { href: '#/settings' }, 'How to install'),
      ),
    ),
    el('div.ds-callout__action', {},
      el('button.btn', { onclick: (e) => { writeInstallDismissed(); e.target.closest('.ds-callout').remove(); } }, 'Not now'),
    ),
  );
}

export function renderDashboard(root) {
  const { profile, stats, exams } = state.progress;
  const total = state.manifest.totalQuestions;
  const recentExams = [...exams].slice(-5).reverse();

  const week = weekStrip(state.progress.activeDays);
  const daysThisWeek = week.filter((d) => d.studied).length;
  const answeredToday = state.progress.dailyAnswers?.[dayKey(new Date())] ?? 0;
  const goal = dailyGoal();

  clear(root,
    el('h1', {}, profile.name ? `CIAO, ${profile.name}` : 'CIAO'),
    el('p.lede', {}, 'Ready for the exam? Keep the streak alive.'),

    // One callout per section: install alert (iOS), then the backup
    // reminder; both sit under the greeting, before the content.
    installReminderPanel(),
    backupReminderPanel(),

    // A newcomer gets the next action instead of raw statistics
    // (Phase 2.2); a user with practice history gets the week + goal
    // panel and the Stat cards.
    stats.answered === 0
      ? nextStepsPanel()
      : statsRow(week, daysThisWeek, answeredToday, goal, stats, total),
    exams.length > 0
      ? weakSpotsPanel()
      : null,
    el('div.panel', { style: 'margin-top:24px' },
      el('h2', {}, "PRONTO PER L'ESAME?"),
      el('p.lede', {}, `${EXAM_QUESTIONS} random questions · ${EXAM_SECONDS / 60} minutes · max ${EXAM_MAX_ERRORS} errors.`),
      el('div.actions', {},
        el('a.btn.btn-primary.btn-big', { href: '#/exam' }, 'START MOCK EXAM'),
        el('a.btn', { href: '#/review' }, `QUICK REVIEW — ${REVIEW_SIZE} QUESTIONS`),
        el('a.btn', { href: '#/practice' }, 'PRACTICE BY TOPIC'),
        el('a.btn', { href: '#/theory' }, 'READ THEORY'),
        el('a.btn', { href: '#/stats' }, 'PROGRESS & STATS'),
        stats.mistakes > 0
          ? el('a.btn', { href: '#/mistakes' }, `REVIEW ${stats.mistakes} MISTAKES`)
          : null,
      ),
    ),
    recentExams.length
      ? el('div.panel', {},
          el('h2', {}, 'RECENT MOCK EXAMS'),
          ...recentExams.map((e) =>
            el('div.row', {},
              el('span', {}, fmtDate(e.date)),
              el('span', {}, `${e.errors} ERRORS / ${e.total}`),
              el('span.tag', { className: `tag ${e.passed ? 'ok' : 'bad'}` }, e.passed ? 'PASSED' : 'FAILED'),
            ),
          ),
        )
      : null,
  );
}



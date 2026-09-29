// Statistics screen: the ACTIVITY heatmap (shared date helpers live here)
// and the PROGRESS & STATS view. Extracted from views.js (Sprint 1, S1.6) —
// pure code move, no behavior change.
import { state } from '../state.js';
import { el, clear } from '../ui.js';
import { topicLabel } from '../topics.js';
import { categoryStats } from './common.js';

const EXAM_MAX_ERRORS = 3;

/* ============================== DASHBOARD ============================== */

/** Local calendar date as YYYY-MM-DD — matches how the domain stores days. */
export function dayKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * The last seven days, oldest first, marked with whether the user studied.
 * Week starts on Monday, as it does in Italy.
 */
export function weekStrip(activeDays = []) {
  const done = new Set(activeDays);
  const initials = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const todayKey = dayKey(new Date());
  const cells = [];
  for (let back = 6; back >= 0; back--) {
    const date = new Date();
    date.setDate(date.getDate() - back);
    const key = dayKey(date);
    // getDay(): 0 = Sunday, so shift to a Monday-first index.
    cells.push({
      key,
      label: initials[(date.getDay() + 6) % 7],
      studied: done.has(key),
      isToday: key === todayKey,
    });
  }
  return cells;
}

/** The activity heatmap: answers per day over the last 90 days, weeks as columns. */
const HEAT_DAYS = 90; // must match the domain's ACTIVE_DAYS_KEPT cap
// Answer counts that reach each step: 1–19, 20–39, 40–79, 80+.
const HEAT_BANDS = [19, 39, 79];
const HEAT_MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

function heatLevel(count) {
  if (!count) return 0;
  if (count <= HEAT_BANDS[0]) return 1;
  if (count <= HEAT_BANDS[1]) return 2;
  if (count <= HEAT_BANDS[2]) return 3;
  return 4;
}

function activityHeatmap() {
  const counts = state.progress.dailyAnswers ?? {};
  const now = new Date();
  const start = new Date();
  start.setDate(start.getDate() - (HEAT_DAYS - 1));
  const startKey = dayKey(start);

  const inWindow = (key) => key >= startKey;
  let total = 0;
  let active = 0;
  let best = null;
  for (const [key, n] of Object.entries(counts)) {
    if (!inWindow(key) || !Number.isInteger(n)) continue;
    total += n;
    if (n > 0) active += 1;
    if (!best || n > best.count) best = { key, count: n };
  }

  if (!active) {
    return el('div.panel', {},
      el('h2', {}, 'ACTIVITY — LAST 90 DAYS'),
      el('p.empty-note', {}, 'Answer some questions and your daily activity will show up here.'),
    );
  }

  // Columns start on Monday (as in Italy), first one on or before the window.
  const firstMonday = new Date(start);
  firstMonday.setDate(firstMonday.getDate() - (firstMonday.getDay() + 6) % 7);
  const columns = [];
  const week = new Date(firstMonday);
  while (week <= now) {
    const cells = [];
    for (let dow = 0; dow < 7; dow++) {
      const date = new Date(week);
      date.setDate(week.getDate() + dow);
      if (date > now) { cells.push(null); continue; }
      const key = dayKey(date);
      if (!inWindow(key)) { cells.push(null); continue; }
      const count = counts[key] ?? 0;
      cells.push({ key, count, level: heatLevel(count) });
    }
    columns.push({ week: new Date(week), cells });
    week.setDate(week.getDate() + 7);
  }

  // A month label where the visible month changes. Labels are wider than one
  // column, so a label that would sit within two columns of the next one is
  // dropped (the later label wins: it has room to the right).
  const wanted = [];
  let lastMonth = -1;
  columns.forEach((col, i) => {
    const idx = col.cells.findIndex((c) => c !== null);
    if (idx < 0) return;
    const d = new Date(col.week);
    d.setDate(d.getDate() + idx);
    if (d.getMonth() === lastMonth) return;
    wanted.push({ i, label: HEAT_MONTHS[d.getMonth()] });
    lastMonth = d.getMonth();
  });
  const labels = new Array(columns.length).fill('');
  for (let j = wanted.length - 1; j >= 0; j--) {
    const nextKept = labels.findIndex((l, k) => k > wanted[j].i && l !== '');
    if (nextKept === -1 || nextKept - wanted[j].i >= 2) labels[wanted[j].i] = wanted[j].label;
  }
  columns.forEach((col, i) => (col.label = labels[i]));

  const grid = el('div.heat-grid', {
    role: 'img',
    'aria-label': `Daily activity over the last ${HEAT_DAYS} days: ${active} active days, ${total} questions answered, best day ${best.count} on ${best.key}`,
  },
    ...columns.map((col) =>
      el('div.heat-col', {},
        ...col.cells.map((cell) =>
          cell === null
            ? el('div.heat-cell', { className: 'heat-cell empty' })
            : el('div.heat-cell', {
                className: `heat-cell l${cell.level}`,
                title: cell.count ? `${cell.count} QUESTIONS · ${cell.key}` : `NONE · ${cell.key}`,
              }),
        ),
      ),
    ),
  );

  return el('div.panel', {},
    el('h2', {}, 'ACTIVITY — LAST 90 DAYS'),
    el('p.stat-sub', { style: 'margin-bottom:12px' },
      `${active} active days · ${total} questions answered · best day ${best.count} (${best.key})`),
    el('div.heat-months', { 'aria-hidden': 'true' },
      ...columns.map((col) => el('span.heat-month', {}, col.label)),
    ),
    grid,
    el('div.heat-legend', { 'aria-hidden': 'true' },
      'LESS',
      ...[0, 1, 2, 3, 4].map((l) => el('div.heat-cell', { className: `heat-cell l${l}` })),
      'MORE',
    ),
  );
}

/* ============================== STATISTICS ============================== */

export function renderStats(root) {
  const { stats, exams, answers } = state.progress;
  const total = state.manifest.totalQuestions;
  const cats = categoryStats();

  // Overall accuracy across every attempt ever made.
  let allCorrect = 0;
  let allTotal = 0;
  for (const a of Object.values(answers)) {
    allCorrect += a.correct;
    allTotal += a.correct + a.wrong;
  }
  const overallAccuracy = allTotal ? Math.round((allCorrect / allTotal) * 100) : null;
  const attempted = Object.keys(answers).length;
  const coveragePct = Math.round((attempted / total) * 100);

  // Weak spots: attempted topics with the lowest accuracy first.
  const weak = cats
    .filter((c) => c.attempted > 0 && c.accuracy !== null)
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, 5);

  // All topics ranked by how much is left to master.
  const ranked = [...cats].sort((a, b) => a.masteredPct - b.masteredPct);

  const recentExams = [...exams].slice(-12);
  const maxErrors = Math.max(EXAM_MAX_ERRORS + 1, ...recentExams.map((e) => e.errors), 1);

  function accTag(acc) {
    if (acc === null) return el('span.tag', {}, 'NOT TRIED');
    const cls = acc >= 90 ? 'ok' : acc >= 70 ? 'warn' : 'bad';
    return el('span.tag', { className: `tag ${cls}` }, `${acc}%`);
  }

  clear(root,
    el('div.quiz-head', {},
      el('h1', { style: 'margin:0' }, 'PROGRESS & STATS'),
      el('a.btn', { href: '#/' }, '← DASHBOARD'),
    ),
    el('p.lede', {}, 'Find your weakest topic and practice it until the tag reads green.'),

    el('div.grid.grid-3', {},
      el('div.card', {},
        el('h2', {}, 'MASTERED'),
        el('p.stat-value.ok', {}, `${Math.round((stats.mastered / total) * 100)}%`),
        el('p.stat-sub', {}, `${stats.mastered} of ${total} questions`),
        el('div.bar', { 'aria-hidden': 'true' }, el('div', { style: `width:${Math.round((stats.mastered / total) * 100)}%` })),
      ),
      el('div.card', {},
        el('h2', {}, 'OVERALL ACCURACY'),
        el('p.stat-value', {}, overallAccuracy === null ? '—' : `${overallAccuracy}%`),
        el('p.stat-sub', {}, `${attempted} questions tried (${coveragePct}% coverage)`),
      ),
      el('div.card', {},
        el('h2', {}, 'EXAM SUCCESS'),
        el('p.stat-value.accent', {}, `${stats.examSuccess}%`),
        el('p.stat-sub', {}, `${stats.examsPassed}/${stats.examsTaken} passed · streak ${stats.streak}`),
      ),
    ),

    activityHeatmap(),

    weak.length
      ? el('div.panel', {},
          el('h2', {}, 'WEAK SPOTS — STUDY THESE FIRST'),
          ...weak.map((c) =>
            el('div.row', {},
              el('div', { style: 'flex:1' },
                el('strong', {}, topicLabel(c)),
                el('p.stat-sub', {}, `Mastered ${c.masteredPct}% · ${c.attempted}/${c.count} tried`),
              ),
              accTag(c.accuracy),
              el('a.btn.btn-small', { href: `#/practice/${c.slug}` }, 'PRACTICE'),
            ),
          ),
        )
      : el('div.panel', {},
          el('h2', {}, 'WEAK SPOTS'),
          el('p.empty-note', {}, 'Answer some questions and your weak topics will show up here.'),
          el('div.actions', {}, el('a.btn.btn-primary', { href: '#/practice' }, 'START PRACTICE')),
        ),

    recentExams.length
      ? el('div.panel', {},
          el('h2', {}, 'MOCK-EXAM TREND'),
          el('p.stat-sub', { style: 'margin-bottom:12px' },
            `Errors per exam · pass line at ${EXAM_MAX_ERRORS} (latest ${recentExams.length})`),
          el('div.exam-trend', {},
            ...recentExams.map((e) =>
              el('div.trend-col', { title: `${e.errors} errors` },
                el('div.trend-bar', {
                  className: `trend-bar ${e.passed ? 'ok' : 'bad'}`,
                  style: `height:${Math.max(6, Math.round((e.errors / maxErrors) * 100))}%`,
                }),
                el('span.trend-label', {}, String(e.errors)),
              ),
            ),
          ),
        )
      : null,

    el('div.panel', {},
      el('h2', {}, 'ALL TOPICS'),
      ...ranked.map((c) =>
        el('div.row', {},
          el('div', { style: 'flex:1' },
            el('strong', {}, topicLabel(c)),
            el('div.bar', { 'aria-hidden': 'true' }, el('div', { style: `width:${c.masteredPct}%` })),
          ),
          el('span.stat-sub', { style: 'min-width:110px;text-align:right' },
            `${c.masteredPct}% · ${c.attempted}/${c.count}`),
          accTag(c.accuracy),
        ),
      ),
    ),
  );
}

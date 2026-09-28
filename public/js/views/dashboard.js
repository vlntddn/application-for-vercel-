import { state } from '../state.js';
import { el, clear, fmtDate, titleCase } from '../ui.js';
import { dailyGoal, categoryStats, PRACTICE_BATCH } from './common.js';
import { dayKey, weekStrip } from './stats.js';

const EXAM_QUESTIONS = 30;
const EXAM_SECONDS = 20 * 60;
const EXAM_MAX_ERRORS = 3;
const REVIEW_SIZE = 10;


/** A hard-edged progress ring: brutalism, so square caps and no gradient. */
export function progressRing(percent, { size = 104, stroke = 12, label = '' } = {}) {
  const pct = Math.max(0, Math.min(100, percent));
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const svgNS = 'http://www.w3.org/2000/svg';

  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  svg.setAttribute('class', 'ring');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `${label}: ${pct}%`);

  const track = document.createElementNS(svgNS, 'circle');
  track.setAttribute('cx', size / 2);
  track.setAttribute('cy', size / 2);
  track.setAttribute('r', r);
  track.setAttribute('class', 'ring-track');
  track.setAttribute('stroke-width', stroke);

  const value = document.createElementNS(svgNS, 'circle');
  value.setAttribute('cx', size / 2);
  value.setAttribute('cy', size / 2);
  value.setAttribute('r', r);
  value.setAttribute('class', 'ring-value');
  value.setAttribute('stroke-width', stroke);
  value.setAttribute('stroke-dasharray', `${circumference}`);
  // A hair of the ring always shows, so 0% still reads as "a ring".
  value.setAttribute('stroke-dashoffset', `${circumference * (1 - pct / 100)}`);
  value.setAttribute('transform', `rotate(-90 ${size / 2} ${size / 2})`);

  svg.append(track, value);
  return svg;
}

/**
 * Dashboard next-step for a newcomer: no raw numbers — one action.
 * Shown until the first answer is recorded.
 */
export function nextStepsPanel() {
  return el('div.panel', { id: 'dashboard-next-steps', style: 'margin-top:24px' },
    el('h2', {}, 'NEXT STEP'),
    el('p.lede', {},
      `You have not answered a question yet. Start with practice: ${PRACTICE_BATCH} questions on a topic you pick — about 5 minutes.`),
    el('div.actions', {},
      el('a.btn.btn-primary.btn-big', { href: '#/practice' }, 'PICK A TOPIC AND START PRACTICE'),
      el('a.btn', { href: '#/theory' }, 'PREFER READING FIRST — OPEN THE THEORY'),
    ),
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
              el('span', {}, titleCase(c.name)),
              el('span.tag', { className: 'tag bad' }, `${c.accuracy}%`),
            ),
          ),
        )
      : el('p.empty-note', {}, 'NO WEAK TOPIC UNDER 70% — KEEP THE STREAK ALIVE'),
    el('div.actions', {},
      weak.length
        ? el('a.btn.btn-primary', { href: `#/practice/${weak[0].slug}` },
            `STRENGTHEN ${titleCase(weak[0].name).toUpperCase()}`)
        : el('a.btn.btn-primary', { href: '#/exam' }, 'ANOTHER MOCK EXAM'),
      state.progress.stats.mistakes > 0
        ? el('a.btn', { href: '#/mistakes' }, `REVIEW ${state.progress.stats.mistakes} MISTAKES`)
        : null,
    ),
  );
}

export function renderDashboard(root) {
  const { profile, stats, exams } = state.progress;
  const total = state.manifest.totalQuestions;
  const masteredPct = Math.round((stats.mastered / total) * 100);
  const recentExams = [...exams].slice(-5).reverse();

  const week = weekStrip(state.progress.activeDays);
  const daysThisWeek = week.filter((d) => d.studied).length;
  const answeredToday = state.progress.dailyAnswers?.[dayKey(new Date())] ?? 0;
  const goal = dailyGoal();
  const goalPct = Math.min(100, Math.round((answeredToday / goal) * 100));

  clear(root,
    el('h1', {}, profile.name ? `CIAO, ${profile.name}` : 'CIAO'),
    el('p.lede', {}, 'READY FOR THE EXAM? KEEP THE STREAK ALIVE.'),

    // The habit, at a glance: which of the last seven days you studied.
    el('div.panel.week-panel', {},
      el('div.quiz-head', { style: 'margin-bottom:12px' },
        el('h2', { style: 'margin:0' }, 'THIS WEEK'),
        el('span.tag', { className: `tag ${daysThisWeek >= 5 ? 'ok' : ''}` },
          `${daysThisWeek}/7 DAYS`),
      ),
      el('div.week-row', {},
        el('div.week', { role: 'img', 'aria-label': `Studied on ${daysThisWeek} of the last 7 days` },
          ...week.map((day) =>
            el('div.week-day', {
              className: `week-day${day.studied ? ' done' : ''}${day.isToday ? ' today' : ''}`,
            },
              el('span.week-cell', { 'aria-hidden': 'true' }, day.studied ? '✓' : ''),
              el('span.week-label', { 'aria-hidden': 'true' }, day.label),
            ),
          ),
        ),
        // The ring tracks today's goal, which actually moves — mastery of
        // 7139 questions would sit near zero for weeks and read as broken.
        el('div.today-goal', {},
          el('div.ring-wrap', {},
            progressRing(goalPct, { label: "Today's goal" }),
            el('div.ring-centre', {},
              el('span.ring-pct', {}, String(answeredToday)),
              el('span.ring-sub', {}, `/ ${goal}`),
            ),
          ),
          el('span.week-label', {}, answeredToday >= goal ? 'GOAL DONE' : 'TODAY'),
        ),
      ),
    ),

    el('div.grid.grid-3', {},
      el('div.card', {},
        el('h2', {}, 'LOGIN STREAK'),
        el('p.stat-value.accent', {}, String(stats.streak)),
        el('p.stat-sub', {}, stats.streak === 1 ? 'DAY IN A ROW' : 'DAYS IN A ROW'),
      ),
      el('div.card', {},
        el('h2', {}, 'QUESTIONS MASTERED'),
        el('p.stat-value.ok', {}, String(stats.mastered)),
        el('p.stat-sub', {}, `OF ${total} (${masteredPct}%)`),
        el('div.bar', { 'aria-hidden': 'true' }, el('div', { style: `width:${masteredPct}%` })),
      ),
      el('div.card', {},
        el('h2', {}, 'EXAM SUCCESS'),
        el('p.stat-value', {}, `${stats.examSuccess}%`),
        el('p.stat-sub', {}, `${stats.examsPassed}/${stats.examsTaken} MOCK EXAMS PASSED`),
      ),
    ),
    // A newcomer gets the next action instead of raw zeros (Phase 2.2);
    // a user who took an exam gets "what to fix until the exam".
    stats.answered === 0
      ? nextStepsPanel()
      : null,
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



// Review screens (Sprint 1, S1.11c): mistakes review and daily quick review.
// Verbatim move from views.js.
import {
  state,
  loadQuestions,
  loadInsights,
  slugForQuestionId,
  shuffle,
} from '../state.js';
import { el, clear } from '../ui.js';
import { errorBanner, pickQueue, categoryStats } from './common.js';
import { renderQuizSession } from './practice.js';
import { t } from '../i18n.js';
import { mistakeCauses } from '../domain/learning.js';
import { dueReview } from '../domain/progress.js';
import { topicLabel } from '../topics.js';

/* ============================== MISTAKES ============================== */

export async function renderMistakes(root) {
  const ids = state.progress.mistakes;
  clear(root, el('h1', {}, t('ms.title')), el('p.lede', {}, t('ms.loading')));

  if (ids.length === 0) {
    return clear(root,
      el('h1', {}, t('ms.title')),
      el('div.panel', {},
        el('p.empty-note', {}, t('ms.empty')),
        el('div.actions', {}, el('a.btn.btn-primary', { href: '#/practice' }, t('ms.goPractice'))),
      ),
    );
  }

  const slugs = [...new Set(ids.map(slugForQuestionId).filter(Boolean))];
  let byId = new Map();
  try {
    for (const slug of slugs) {
      for (const q of await loadQuestions(slug)) byId.set(q.id, q);
    }
  } catch (err) {
    return clear(root, errorBanner(err));
  }
  const questions = ids.map((id) => byId.get(id)).filter(Boolean);

  // L3 — «why you keep missing»: top cause across current mistakes + drill link.
  let causePanel = null;
  try {
    const insights = await loadInsights();
    const { perQuestion, counts } = mistakeCauses(state.progress.answers, questions, insights, null);
    const causesById = new Map(perQuestion.map((p) => [p.questionId, p.causes]));
    const order = ['signal', 'sign', 'number', 'rule'];
    const top = order.map((c) => [c, counts[c]]).filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1] || order.indexOf(a[0]) - order.indexOf(b[0]))[0];
    if (top) {
      const [cause, n] = top;
      // signal → the L1c drill; number → L4 (not built yet) → practice;
      // sign → practice (sign-heavy questions come first there);
      // rule → the chapter with the most rule mistakes.
      let href = '#/practice';
      let extra = '';
      if (cause === 'signal') {
        href = '#/drill/signals';
      } else if (cause === 'rule') {
        const bySlug = new Map();
        for (const q of questions) {
          if (!causesById.get(q.id)?.includes('rule')) continue;
          const slug = slugForQuestionId(q.id);
          if (slug) bySlug.set(slug, (bySlug.get(slug) || 0) + 1);
        }
        const best = [...bySlug.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
        if (best) {
          href = `#/practice/${best}`;
          const cat = state.manifest.categories.find((c) => c.slug === best);
          if (cat) extra = ` — ${topicLabel(cat)}`;
        }
      }
      causePanel = el('div.panel', { style: 'margin-bottom:24px' },
        el('h2', {}, t('ms.causeTitle', { part: t(`ms.causes.${cause}`), extra, n, total: questions.length })),
        el('div.actions', {}, el('a.btn', { href }, t('ms.practiceThis'))),
      );
    }
  } catch {
    /* insights unavailable — the panel is optional */
  }

  clear(root,
    el('h1', {}, t('ms.title')),
    el('p.lede', {}, t('ms.lede', { n: questions.length })),
    causePanel,
    el('div.actions', { style: 'margin-bottom:24px' },
      el('button.btn.btn-primary.btn-big', {
        onclick: () =>
          renderQuizSession(root, shuffle(questions), {
            title: t('ms.sessionTitle'),
            backHash: '#/mistakes',
            onFinish: () => renderMistakes(root),
          }),
      }, t('ms.practiceAll')),
    ),
    el('div.panel', {},
      ...questions.slice(0, 50).map((q) =>
        el('div.row', {},
          el('span', { style: 'flex:1', translate: 'no', lang: 'it' }, q.text_it),
          el('span.tag.bad', { translate: 'no', lang: 'it' }, q.is_true ? 'VERO' : 'FALSO'),
        ),
      ),
      questions.length > 50 ? el('p.empty-note', {}, t('ms.more', { n: questions.length - 50 })) : null,
    ),
  );
}

/* ============================ QUICK REVIEW ============================ */

const REVIEW_SIZE = 10;

/**
 * Daily smart session: current mistakes first, then questions from the
 * weakest topics, then "retention" — questions answered correctly the
 * longest time ago. New users just get a starter mix.
 */
export async function renderQuickReview(root) {
  clear(root, el('h1', {}, t('qr.title')), el('p.lede', {}, t('qr.loading')));
  const picked = new Map(); // id -> question

  async function resolveIds(ids) {
    const bySlug = new Map();
    for (const id of ids) {
      const slug = slugForQuestionId(id);
      if (slug) (bySlug.get(slug) ?? bySlug.set(slug, []).get(slug)).push(id);
    }
    const out = [];
    for (const [slug, list] of bySlug) {
      try {
        const qs = await loadQuestions(slug);
        const byId = new Map(qs.map((q) => [q.id, q]));
        for (const id of list) if (byId.has(id)) out.push(byId.get(id));
      } catch {
        /* skip unavailable topics */
      }
    }
    return out;
  }

  // L6b — everything due today, oldest first, is the session's priority list.
  const dueIds = dueReview(state.progress.answers);
  try {
    // 0. L6b — spaced repetition: everything whose review date has come
    //    (due <= today), oldest first. The rest of the old mix fills in
    //    behind it, so a full session starts with the overdue cards.
    for (const q of await resolveIds(dueIds)) {
      picked.set(q.id, q);
    }

    // 1. Mistakes — the highest-value repetitions (up to 4).
    for (const q of await resolveIds(shuffle(state.progress.mistakes).slice(0, 4))) {
      picked.set(q.id, q);
    }

    // 2. Weakest attempted topics — unseen/wrong questions first (up to 4).
    const weak = categoryStats()
      .filter((c) => c.attempted > 0 && c.accuracy !== null && c.accuracy < 100)
      .sort((a, b) => a.accuracy - b.accuracy)
      .slice(0, 2);
    for (const c of weak) {
      const qs = await loadQuestions(c.slug);
      for (const q of pickQueue(qs.filter((q) => !picked.has(q.id)), 2)) picked.set(q.id, q);
    }

    // 3. Retention — correct answers not seen for the longest time.
    if (picked.size < REVIEW_SIZE) {
      const stale = Object.entries(state.progress.answers)
        .filter(([id, a]) => a.lastCorrect && !picked.has(id))
        .sort((a, b) => (a[1].last || '').localeCompare(b[1].last || ''))
        .slice(0, REVIEW_SIZE - picked.size)
        .map(([id]) => id);
      for (const q of await resolveIds(stale)) picked.set(q.id, q);
    }

    // 4. Starter fill for new users: unseen questions from random topics.
    if (picked.size < REVIEW_SIZE) {
      for (const c of shuffle(state.manifest.categories).slice(0, 3)) {
        if (picked.size >= REVIEW_SIZE) break;
        const qs = await loadQuestions(c.slug);
        for (const q of pickQueue(qs.filter((q) => !picked.has(q.id)), REVIEW_SIZE - picked.size)) {
          picked.set(q.id, q);
        }
      }
    }
  } catch (err) {
    return clear(root, errorBanner(err));
  }

  // L6b — due cards stay at the front of the session, oldest due first;
  // everything else is shuffled behind them.
  const dueSet = new Set(dueIds);
  const dueFirst = [...picked.values()].filter((q) => dueSet.has(q.id));
  const rest = shuffle([...picked.values()].filter((q) => !dueSet.has(q.id)));
  const queue = [...dueFirst, ...rest].slice(0, REVIEW_SIZE);
  renderQuizSession(root, queue, {
    title: t('qr.title'),
    backHash: '#/',
    onQuit: () => { location.hash = '#/'; },
    onFinish: (correct, total) => {
      clear(root,
        el('h1', {}, t('qr.doneTitle')),
        el('div.panel', {},
          el('p.stat-value', { className: `stat-value ${correct === total ? 'ok' : ''}` },
            `${correct}/${total}`),
          el('p.stat-sub', {}, t(correct === total ? 'qr.perfect' : 'qr.misses')),
          el('div.actions', { style: 'margin-top:16px' },
            el('a.btn.btn-primary', { href: '#/' }, t('qr.dashboard')),
            el('button.btn', { onclick: () => renderQuickReview(root) }, t('qr.oneMore')),
          ),
        ),
      );
    },
  });
}

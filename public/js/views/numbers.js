// L4 — «Числа, которые надо знать» (#/numbers).
// Two states on one screen:
//   1) the table — every must-know number, grouped by chapter, with the
//      count of bank questions that touch it (data/insights/numbers.json);
//   2) the drill — 20 bank questions containing at least one known number
//      (50/50 FALSO traps / VERO counter-examples, queue = numbersQueue).
// The table is a read-only reference; the drill records answers like the
// other trainers do. START THE DRILL swaps the table for the drill in place.
import {
  loadNumbers,
  loadLessons,
  loadTheory,
  loadAllQuestions,
  recordAnswersResilient,
} from '../state.js';
import { el, clear, svgIcon } from '../ui.js';
import { playCorrect, playWrong } from '../sound.js';
import { errorBanner, translationOf, loc, translationArea, feedbackHref } from './common.js';
import { numbersQueue, numberSpans } from '../domain/learning.js';

const DRILL_SIZE = 20;

export async function renderNumbers(root) {
  clear(root,
    el('h1', {}, 'The numbers you must know'),
    el('p.lede', {}, 'Loading...'),
  );
  let numbers, lessons, theory, questions;
  try {
    [numbers, lessons, theory, questions] = await Promise.all([
      loadNumbers(), loadLessons(), loadTheory(), loadAllQuestions(),
    ]);
  } catch (err) {
    return clear(root, errorBanner(err));
  }
  drawTable(root, numbers, lessons, theory, questions);
}

/** Chapter id → display title (theory.json carries the titles). */
function chapterTitles(theory) {
  const byId = new Map((theory?.chapters || []).map((c) => [c.id, c.title_it]));
  return (id) => byId.get(id) || `Cap. ${String(id).replace(/\D/g, '')}`;
}

/** The lesson note behind a table row (multilingual {en,ru,zh} or null). */
function noteFor(lessons, row) {
  const ch = lessons?.chapters?.[row.chapter];
  const fact = (ch?.mustKnow || []).find((m) => m.fact_it === row.fact);
  return fact?.note || null;
}

function tableBlock(numbers, lessons, titleOf) {
  const rows = numbers.table || [];
  const byChapter = new Map();
  for (const row of rows) {
    if (!byChapter.has(row.chapter)) byChapter.set(row.chapter, []);
    byChapter.get(row.chapter).push(row);
  }
  const chapters = [...byChapter.entries()].sort((a, b) =>
    Number(String(a[0]).replace(/\D/g, '')) - Number(String(b[0]).replace(/\D/g, '')));
  const total = rows.reduce((s, r) => s + r.questions, 0);

  return el('div.panel', {},
    el('h1', {}, 'The numbers you must know'),
    el('p.lede', {}, `${rows.length} facts · ${total} bank questions touch these numbers.`),
    ...chapters.map(([ch, chRows]) => el('section.numbers-chapter', {},
      el('h2.numbers-chapter__title', {}, titleOf(ch)),
      ...chRows.map((r) => el('div.numbers-fact', {},
        el('div.numbers-fact__head', {},
          el('span.numbers-fact__name', {}, r.fact),
          el('span.numbers-fact__value', {}, r.value)),
        noteFor(lessons, r) ? el('p.numbers-fact__note', {}, loc(noteFor(lessons, r))) : null,
        el('p.numbers-fact__sub', {},
          `${r.questions} bank question${r.questions === 1 ? '' : 's'} use this number`),
      )),
    )),
  );
}

/** State 1 — the reference table plus the drill entry point. */
function drawTable(root, numbers, lessons, theory, questions) {
  clear(root,
    tableBlock(numbers, lessons, chapterTitles(theory)),
    el('div.actions', { style: 'margin-top:24px' },
      el('button.btn.btn-primary.btn-big', { type: 'button', onclick: () =>
        drawDrill(root, numbers, questions) }, 'START THE DRILL →'),
    ),
  );
}

/** State 2 — the 20-question FALSO/VERO drill (mirrors views/drill.js). */
function drawDrill(root, numbers, questions) {
  const pool = numbersQueue(questions, numbers, DRILL_SIZE);
  // L4's numbersQueue targets 50/50 but tolerates skew when one side of the
  // bank runs dry — so we only need a usable pool, not an exact split.
  const falseCount = pool.filter((q) => q.is_true === false).length;
  const trueCount = pool.length - falseCount;
  if (pool.length < 10 || falseCount === 0 || trueCount === 0) {
    return clear(root,
      el('h1', {}, 'The numbers you must know'),
      errorBanner(new Error(
        `Need a balanced pool of at least 10 number questions (found ${pool.length}: ${falseCount} FALSO / ${trueCount} VERO).`)),
    );
  }
  // Token → counts, so the feedback can say «50 — FALSO in 62% of the bank».
  const tokenById = new Map((numbers.tokens || []).map((t) => [t.token, t]));

  const total = pool.length;
  let index = 0, answered = false, chosenValue = null, lastCorrect = null, correctCount = 0;
  let revealed = false, feedbackPanel = null, offline = false;

  const keyHandler = (e) => {
    const key = e.key.toLowerCase();
    if (key === 't') return reveal();
    if (!answered) {
      if (key === 'v' || key === 'arrowleft') answer(true);
      if (key === 'f' || key === 'arrowright') answer(false);
    } else if (key === 'enter' || key === ' ') {
      e.preventDefault();
      next();
    }
  };
  document.addEventListener('keydown', keyHandler);
  document.body.classList.add('in-session');
  window.addEventListener('hashchange', () => {
    document.removeEventListener('keydown', keyHandler);
    document.body.classList.remove('in-session');
  }, { once: true });

  function reveal() {
    if (revealed || !answered) return;
    revealed = true;
    draw();
  }

  async function answer(value) {
    if (answered) return;
    answered = true;
    chosenValue = value;
    const q = pool[index];
    lastCorrect = value === q.is_true;
    if (lastCorrect) correctCount++;
    if (lastCorrect) playCorrect(); else playWrong();
    draw();
    feedbackPanel?.querySelector('button')?.focus();
    try {
      const { synced } = await recordAnswersResilient([{ id: q.id, correct: lastCorrect }]);
      if (offline !== !synced) { offline = !synced; draw(); }
    } catch (err) {
      root.prepend(errorBanner(err));
    }
  }

  function next() {
    answered = false; lastCorrect = null; chosenValue = null;
    revealed = false; feedbackPanel = null; index++;
    if (index >= pool.length) {
      document.removeEventListener('keydown', keyHandler);
      document.body.classList.remove('in-session');
      finish();
    } else draw();
  }

  function finish() {
    clear(root,
      el('div.panel', { style: 'text-align:center' },
        el('h1', {}, 'Numbers drill complete'),
        el('p.stat-value.ok', {}, `${correctCount}/${total}`),
        el('p.lede', {}, 'Correct answers'),
        el('div.actions', { style: 'justify-content:center' },
          el('button.btn.btn-primary', { type: 'button', onclick: () =>
            drawDrill(root, numbers, questions) }, 'ONE MORE ROUND'),
          el('a.btn', { href: '#/exam-italian' }, 'THE EXAM GUIDE'),
          el('a.btn', { href: '#/' }, 'DASHBOARD'),
        ),
      ),
    );
  }

  function numberNote(q) {
    const t = tokenById.get(q.number);
    if (!t || !t.total) return null;
    const pct = Math.round((t.false / t.total) * 100);
    const nodes = [el('p.signal-ratio', {}, `«${q.number}» — FALSO in ${pct}% of the bank`)];
    if (q.is_true) nodes.push(el('p.signal-true', {}, 'here the number makes the statement VERO'));
    return el('div.signal-notes', {}, ...nodes);
  }

  function buildFeedbackPanel(q) {
    const panel = el('div', {
      className: `ds-feedback ${lastCorrect ? 'ds-feedback--ok' : 'ds-feedback--bad'}`,
      role: 'status',
    },
      el('div.ds-feedback__head', {},
        svgIcon(lastCorrect ? 'check' : 'cross'),
        lastCorrect ? 'Correct' : 'Not quite'),
      lastCorrect
        ? null
        : el('div.ds-feedback__answer', {}, `Right answer: ${q.is_true ? 'Vero' : 'Falso'}`),
    );
    const note = numberNote(q);
    if (note) panel.append(note);
    panel.append(
      el('div.ds-feedback__actions', {},
        el('button.btn.btn-primary', { type: 'button', onclick: next },
          index + 1 >= pool.length ? 'FINISH' : 'NEXT →'),
      ),
      el('a.report-link', {
        href: feedbackHref(
          'Passo: problem with question ' + q.id,
          `Question: ${q.id}\n«${q.text_it}»\nCorrect answer in the app: ${q.is_true ? 'VERO' : 'FALSO'}\n\nWhat is wrong:\n`,
        ),
      }, 'Report a problem with this question'),
    );
    return panel;
  }

  function answerButtons(q) {
    const btn = (value, icon, label) => {
      let stateStr = '';
      let word = null;
      const picked = chosenValue === value;
      const isRight = value === q.is_true;
      if (answered) {
        if (picked && lastCorrect) { stateStr = 'ds-answer--ok'; word = 'Correct'; }
        else if (picked && !lastCorrect) { stateStr = 'ds-answer--bad'; word = 'Wrong'; }
        else if (!picked && !lastCorrect && isRight) { stateStr = 'ds-answer--reveal'; word = 'Right answer'; }
      }
      return el('button', {
        type: 'button',
        className: `ds-answer ${value ? 'btn-true' : 'btn-false'}${stateStr ? ` ${stateStr}` : ''}`,
        'aria-pressed': answered ? picked : null,
        disabled: answered,
        onclick: answered ? undefined : () => answer(value),
      },
        svgIcon(icon), label,
        word ? el('span.ds-answer__state', {}, word) : null);
    };
    return el('div.ds-answers', {}, btn(true, 'check', 'VERO'), btn(false, 'cross', 'FALSO'));
  }

  function questionText(q) {
    return numberSpans(q.text_it, q.number ? [q.number] : []).map((s) =>
      s.mark ? el('mark.ds-signal', {}, s.text) : s.text);
  }

  function draw() {
    const q = pool[index];
    clear(root,
      offline
        ? el('p.offline-note', { role: 'status' },
          'Offline — answers saved on this device, will sync when the server is back')
        : null,
      el('div.quiz-head', {},
        el('a.btn', { href: '#/numbers' }, '← BACK TO TABLE'),
        el('span.quiz-progress', {}, `Numbers — ${index + 1}/${total}`),
        el('span.tag.ok', {}, `${correctCount} CORRECT`),
      ),
      el('div.panel.question-card', {},
        q.image_url ? el('img.question-img', {
          src: q.image_url, alt: 'Road sign / situation',
          onerror: (e) => e.target.remove(),
        }) : null,
        el('p.question-text', {}, ...questionText(q)),
        translationArea(translationOf(q), revealed, reveal),
        answerButtons(q),
        answered ? (feedbackPanel ??= buildFeedbackPanel(q)) : null,
        el('p.kbd-hint', {},
          answered
            ? [el('kbd', {}, 'ENTER'), ' NEXT · ', el('kbd', {}, 'T'), ' TRANSLATE']
            : [el('kbd', {}, 'V'), ' VERO · ', el('kbd', {}, 'F'), ' FALSO · ', el('kbd', {}, 'T'), ' TRANSLATE'],
        ),
      ),
    );
  }

  draw();
}

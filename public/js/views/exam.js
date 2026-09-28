import { loadAllQuestions, recordAnswersResilient, recordExamResilient, shuffle } from '../state.js';
import { el, clear, fmtTime } from '../ui.js';
import { errorBanner, translationOf, translationArea } from './common.js';

const EXAM_QUESTIONS = 30;
const EXAM_SECONDS = 20 * 60;
const EXAM_MAX_ERRORS = 3;

export async function renderExam(root) {
  clear(root,
    el('h1', {}, 'MOCK EXAM'),
    el('p.lede', {},
      'THIS IS PRACTICE, NOT THE OFFICIAL EXAM — BUT THE FORMAT AND THE DIFFICULTY ARE IDENTICAL.'),
    el('div.panel', {},
      el('h2', {}, 'HOW THE REAL EXAM WORKS'),
      el('p.stat-sub', {}, '30 RANDOM QUESTIONS ON SIGNS AND TRAFFIC RULES'),
      el('p.stat-sub', {}, '20 MINUTES — THE TIMER STARTS THE MOMENT YOU BEGIN'),
      el('p.stat-sub', {}, 'PASS WITH AT MOST 3 ERRORS — MORE, AND THE EXAM FAILS'),
      el('p.stat-sub', {}, 'MOVE BACK AND FORTH BETWEEN QUESTIONS — UNANSWERED COUNTS AS WRONG'),
      el('p.stat-sub', {},
        'QUESTIONS ARE IN ITALIAN; ', el('kbd', {}, 'T'),
        ' OR THE TRANSLATE BUTTON SHOWS YOUR LANGUAGE'),
      el('div.actions', {},
        el('button.btn.btn-primary.btn-big', { onclick: start }, 'BEGIN EXAM'),
        el('a.btn', { href: '#/' }, 'NOT YET'),
      ),
    ),
  );

  async function start() {
    clear(root, el('h1', {}, 'MOCK EXAM'), el('p.lede', { id: 'load-note' }, 'LOADING QUESTION BANK...'));
    let all;
    try {
      all = await loadAllQuestions((done, total) => {
        const note = document.getElementById('load-note');
        if (note) note.textContent = `LOADING QUESTION BANK... ${done}/${total}`;
      });
    } catch (err) {
      return clear(root, errorBanner(err));
    }
    runExam(root, shuffle(all).slice(0, EXAM_QUESTIONS));
  }
}

function runExam(root, questions) {
  const chosen = new Array(questions.length).fill(null);
  let index = 0;
  let secondsLeft = EXAM_SECONDS;
  let finished = false;
  let revealed = false; // translation visibility, reset per question

  const timerEl = el('span.timer', { role: 'timer', 'aria-label': 'Time left' }, fmtTime(secondsLeft));
  // Navigating away abandons the exam: stop the timer and keys so they
  // cannot fire over a different screen.
  window.addEventListener('hashchange', () => {
    finished = true;
    clearInterval(interval);
    document.removeEventListener('keydown', keyHandler);
  }, { once: true });
  const interval = setInterval(() => {
    if (finished) return clearInterval(interval);
    secondsLeft--;
    timerEl.textContent = fmtTime(secondsLeft);
    if (secondsLeft <= 60) timerEl.classList.add('low');
    if (secondsLeft <= 0) submit();
  }, 1000);

  function keyHandler(e) {
    if (finished) return;
    const key = e.key.toLowerCase();
    if (key === 'v') choose(true);
    if (key === 'f') choose(false);
    if (key === 't') { revealed = true; draw(); }
    if (key === 'arrowleft' && index > 0) { index--; revealed = false; draw(); }
    if (key === 'arrowright' && index < questions.length - 1) { index++; revealed = false; draw(); }
  }
  document.addEventListener('keydown', keyHandler);

  function goTo(i) {
    index = i;
    revealed = false;
    draw();
  }

  function choose(value) {
    chosen[index] = value;
    if (index < questions.length - 1) index++;
    revealed = false;
    draw();
  }

  async function submit() {
    if (finished) return;
    finished = true;
    clearInterval(interval);
    document.removeEventListener('keydown', keyHandler);
    const errors = questions.reduce(
      (n, q, i) => n + (chosen[i] === q.is_true ? 0 : 1), 0);
    const passed = errors <= EXAM_MAX_ERRORS;

    clear(root, el('h1', {}, 'MOCK EXAM'), el('p.lede', {}, 'SAVING RESULT...'));
    // A finished exam must survive a network blip: both the result and
    // the answers go through the offline-capable queue.
    let synced = true;
    try {
      ({ synced } = await recordExamResilient({ total: questions.length, errors, passed }));
      const answerSync = await recordAnswersResilient(
        questions.map((q, i) => ({ id: q.id, correct: chosen[i] === q.is_true })),
      );
      synced = synced && answerSync.synced;
    } catch (err) {
      root.prepend(errorBanner(err));
    }

    const wrongOnes = questions.filter((q, i) => chosen[i] !== q.is_true);
    clear(root,
      synced
        ? null
        : el('p.offline-note', { role: 'status' },
            'OFFLINE — THIS RESULT IS SAVED ON THIS DEVICE AND WILL SYNC LATER'),
      el('div.panel', { style: 'text-align:center' },
        el('h1', {}, passed ? 'PROMOSSO!' : 'BOCCIATO'),
        el('p.stat-value', { className: `stat-value ${passed ? 'ok' : 'accent'}` },
          `${errors} ERRORS`),
        el('p.lede', {}, `OUT OF ${questions.length} QUESTIONS (LIMIT: ${EXAM_MAX_ERRORS})`),
        el('div.actions', { style: 'justify-content:center' },
          el('button.btn.btn-primary', { onclick: () => renderExam(root) }, 'TRY AGAIN'),
          wrongOnes.length ? el('a.btn', { href: '#/mistakes' }, 'REVIEW MISTAKES') : null,
          el('a.btn', { href: '#/' }, 'DASHBOARD'),
        ),
      ),
      wrongOnes.length
        ? el('div.panel', {},
            el('h2', {}, 'WHAT WENT WRONG'),
            ...wrongOnes.map((q) =>
              el('div.row', {},
                el('span', { style: 'flex:1' }, q.text_it),
                el('span.tag.bad', {}, `ANSWER: ${q.is_true ? 'VERO' : 'FALSO'}`),
              ),
            ),
          )
        : null,
    );
  }

  function draw() {
    const q = questions[index];
    const answeredCount = chosen.filter((c) => c !== null).length;
    clear(root,
      el('div.quiz-head', {},
        el('span.quiz-progress', {}, `QUESTION ${index + 1}/${questions.length}`),
        timerEl,
        el('span.tag', {}, `${answeredCount} ANSWERED`),
      ),
      el('div.panel.question-card', {},
        q.image_url ? el('img.question-img', { src: q.image_url, alt: 'Road sign / situation', onerror: (e) => e.target.remove() }) : null,
        el('p.question-text', {}, q.text_it),
        translationArea(translationOf(q), revealed, () => { revealed = true; draw(); }),
        el('div.answers', {},
          el('button.btn.btn-true', {
            style: chosen[index] === true ? 'outline:4px solid var(--ink)' : '',
            onclick: () => choose(true),
          }, 'VERO'),
          el('button.btn.btn-false', {
            style: chosen[index] === false ? 'outline:4px solid var(--ink)' : '',
            onclick: () => choose(false),
          }, 'FALSO'),
        ),
        el('p.kbd-hint', {},
          el('kbd', {}, 'V'), ' VERO · ', el('kbd', {}, 'F'), ' FALSO · ',
          el('kbd', {}, '←'), el('kbd', {}, '→'), ' NAVIGATE · ', el('kbd', {}, 'T'), ' TRANSLATE'),
        el('div.exam-nav', {},
          ...questions.map((_, i) =>
            el('button', {
              textContent: String(i + 1),
              className: `${chosen[i] !== null ? 'answered' : ''} ${i === index ? 'current' : ''}`,
              onclick: () => goTo(i),
            }),
          ),
        ),
        el('div.actions', {},
          el('button.btn.btn-primary.btn-big', {
            onclick: () => {
              const left = chosen.filter((c) => c === null).length;
              if (left === 0 || confirm(`${left} unanswered (counted as wrong). Submit anyway?`)) submit();
            },
          }, 'SUBMIT EXAM'),
        ),
      ),
    );
  }

  draw();
}

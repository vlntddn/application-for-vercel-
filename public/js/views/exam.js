import { loadAllQuestions, loadExplanations, loadLessons, loadTheory, recordAnswersResilient, recordExamResilient, shuffle, slugForQuestionId } from '../state.js';
import { el, clear, fmtTime, svgIcon } from '../ui.js';
import { t } from '../i18n.js';
import { errorBanner, translationOf, translationArea, lang } from './common.js';
import { CATEGORY_CHAPTER } from '../theory-map.js';

const EXAM_QUESTIONS = 30;
const EXAM_SECONDS = 20 * 60;
const EXAM_MAX_ERRORS = 3;

export async function renderExam(root) {
  clear(root,
    el('h1', {}, t('ex.title')),
    el('p.lede', {}, t('ex.lede')),
    el('div.panel', {},
      el('h2', {}, t('ex.howTitle')),
      el('p.stat-sub', {}, t('ex.howQuestions')),
      el('p.stat-sub', {}, t('ex.howTime')),
      el('p.stat-sub', {}, t('ex.howErrors')),
      el('p.stat-sub', {}, t('ex.howNav')),
      el('p.stat-sub', {},
        t('ex.howTranslate').split('{k}')[0], el('kbd', {}, 'T'),
        t('ex.howTranslate').split('{k}')[1]),
      el('div.actions', {},
        el('button.btn.btn-primary.btn-big', { onclick: start }, t('ex.begin')),
        el('a.btn', { href: '#/' }, t('ex.notYet')),
      ),
    ),
  );

  async function start() {
    clear(root, el('h1', {}, t('ex.title')), el('p.lede', { id: 'load-note' }, t('ex.loading')));
    let all;
    try {
      all = await loadAllQuestions((done, total) => {
        const note = document.getElementById('load-note');
        if (note) note.textContent = t('ex.loadingCount', { done, total });
      });
    } catch (err) {
      return clear(root, errorBanner(err));
    }
    runExam(root, shuffle(all).slice(0, EXAM_QUESTIONS));
  }
}

function runExam(root, questions) {
  // S2.7: hide the fixed bottom bar while the timed exam runs.
  document.body.classList.add('in-session');
  const chosen = new Array(questions.length).fill(null);
  let index = 0;
  let secondsLeft = EXAM_SECONDS;
  let finished = false;
  let revealed = false; // translation visibility, reset per question

  const timerEl = el('span.timer', { role: 'timer', 'aria-label': t('ex.timeAria') }, fmtTime(secondsLeft));
  // Navigating away abandons the exam: stop the timer and keys so they
  // cannot fire over a different screen.
  window.addEventListener('hashchange', () => {
    finished = true;
    clearInterval(interval);
    document.removeEventListener('keydown', keyHandler);
    document.body.classList.remove('in-session');
  }, { once: true });
  const interval = setInterval(() => {
    if (finished) return clearInterval(interval);
    secondsLeft--;
    timerEl.textContent = fmtTime(secondsLeft);
    if (secondsLeft <= 2 * 60) timerEl.classList.add('low');
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
    document.body.classList.remove('in-session');
    const errors = questions.reduce(
      (n, q, i) => n + (chosen[i] === q.is_true ? 0 : 1), 0);
    const passed = errors <= EXAM_MAX_ERRORS;

    clear(root, el('h1', {}, t('ex.title')), el('p.lede', {}, t('ex.saving')));
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

    const wrongOnes = questions
      .map((q, i) => ({ q, pick: chosen[i] }))
      .filter(({ q, pick }) => pick !== q.is_true);
    clear(root,
      synced
        ? null
        : el('p.offline-note', { role: 'status' }, t('ex.offline')),
      el('div.panel', { style: 'text-align:center' },
        el('h1', {}, passed ? t('ex.verdictPassed') : t('ex.verdictFailed')),
        el('p.stat-value', { className: `stat-value ${passed ? 'ok' : 'accent'}` },
          t('ex.errorsN', { n: errors })),
        el('p.lede', {}, t('ex.errorsOf', { total: questions.length, limit: EXAM_MAX_ERRORS })),
        el('div.actions.exam-result-actions', { style: 'justify-content:center' },
          el('button.btn.btn-primary', { onclick: () => renderExam(root) }, t('ex.tryAgain')),
          wrongOnes.length ? el('a.btn', { href: '#/mistakes' }, t('ex.reviewMistakes')) : null,
          el('a.btn', { href: '#/' }, t('ex.dashboard')),
        ),
      ),
      wrongOnes.length
        ? el('div.panel', {},
            el('h2', {}, t('ex.wrongTitle')),
            ...wrongOnes.map(({ q, pick }) =>
              el('div.row.ex-wrong-row', {},
                el('span.ex-wrong-text', {},
                  q.text_it,
                  el('span.ex-wrong-tags', {},
                    el('span.tag.bad', {}, t('ex.yourTag', { ans: pick ? 'VERO' : 'FALSO' })),
                    el('span.tag.ok', {}, t('ex.rightTag', { ans: q.is_true ? 'VERO' : 'FALSO' })),
                  ),
                ),
                whyLink(q),
              ),
            ),
          )
        : null,
    );
  }

  /** Q6: «Why?» link to the theory chapter that teaches this question —
   *  only when we actually have an explanation (a lesson trap or an L9a
   *  explanation entry). Fire-and-forget: the link appears once the data
   *  resolves, or the row stays without one. */
  function whyLink(question) {
    const span = el('span.ex-wrong-why');
    (async () => {
      const slug = slugForQuestionId(question.id);
      const chapterId = slug ? CATEGORY_CHAPTER[slug] : null;
      if (!chapterId) return;
      let hasExplanation = false;
      try {
        const lesson = (await loadLessons()).chapters?.[chapterId];
        hasExplanation = (lesson?.traps || []).some((tr) => tr.id === question.id && tr.why);
      } catch { /* no lesson → fall through to explanations */ }
      if (!hasExplanation) {
        try {
          const file = await loadExplanations(slug);
          hasExplanation = Boolean(file?.items?.[question.id]);
        } catch { /* missing explanation file */ }
      }
      if (!hasExplanation) return;
      const theory = await loadTheory().catch(() => null);
      const chapter = (Array.isArray(theory) ? theory : theory?.chapters || []).find?.((c) => c.id === chapterId);
      const title = chapter?.translations?.[lang()]?.title || chapter?.title_it;
      const link = el('a.ex-wrong-why__link', { href: `#/theory/${chapterId}` }, t('ex.why'));
      if (title) link.title = title;
      span.append(link);
    })();
    return span;
  }

  function draw() {
    const q = questions[index];
    const answeredCount = chosen.filter((c) => c !== null).length;
    clear(root,
      el('div.quiz-head', {},
        el('span.quiz-progress', {}, t('ex.questionN', { current: index + 1, total: questions.length })),
        timerEl,
        el('span.tag', {}, t('ex.answeredN', { n: answeredCount })),
      ),
      el('div.panel.question-card', {},
        q.image_url ? el('img.question-img', { src: q.image_url, alt: t('ex.imgAlt'), onerror: (e) => e.target.remove() }) : null,
        el('p.question-text', {}, q.text_it),
        translationArea(translationOf(q), revealed, () => { revealed = true; draw(); }),
        (() => {
          // Neutral at rest; after choosing: the picked button shows ok/bad +
          // a word, a wrong pick gets the dashed "Right answer" reveal on the
          // correct one (AnswerButton component).
          const btn = (value, icon, label) => {
            let state = '';
            let word = null;
            const picked = chosen[index] === value;
            if (picked) {
              const right = value === q.is_true;
              state = right ? 'ds-answer--ok' : 'ds-answer--bad';
              word = right ? t('pr.correct') : t('pr.wrong');
            } else if (chosen[index] !== null && !chosen[index] && value === q.is_true) {
              state = 'ds-answer--reveal';
              word = t('pr.rightAnswerTag');
            }
            return el('button', {
              type: 'button',
              className: `ds-answer ${value ? 'btn-true' : 'btn-false'}${state ? ` ${state}` : ''}`,
              'aria-pressed': picked,
              onclick: () => choose(value),
            }, svgIcon(icon), label, word ? el('span.ds-answer__state', {}, word) : null);
          };
          return el('div.ds-answers', {}, btn(true, 'check', 'VERO'), btn(false, 'cross', 'FALSO'));
        })(),
        el('p.kbd-hint', {},
          el('kbd', {}, 'V'), ' ' + t('ex.kbdTrue') + ' · ', el('kbd', {}, 'F'), ' ' + t('ex.kbdFalse') + ' · ',
          el('kbd', {}, '←'), el('kbd', {}, '→'), ' ' + t('ex.kbdNavigate') + ' · ', el('kbd', {}, 'T'), ' ' + t('ex.kbdTranslate')),
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
              if (left === 0 || confirm(t('ex.confirmSubmit', { n: left }))) submit();
            },
          }, t('ex.submit')),
        ),
      ),
    );
  }

  draw();
}

// Search screen, extracted from views.js (Sprint 1, S1.4) — pure code move, no behavior change.
import { loadAllQuestions, shuffle } from '../state.js';
import { el, clear } from '../ui.js';
import { errorBanner, translationOf, PRACTICE_BATCH } from './common.js';
import { renderQuizSession } from './practice.js';

/* ============================== SEARCH ============================== */

/** Strips accents so "puo" matches "può" and vice versa. */
function fold(s) {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Full-text search across the whole bank (Italian + the user's
 * translation language). Results can be practiced as a session.
 */
export async function renderSearch(root) {
  clear(root, el('h1', {}, 'SEARCH'), el('p.lede', {}, 'Loading the question bank...'));
  let all;
  try {
    all = await loadAllQuestions();
  } catch (err) {
    return clear(root, errorBanner(err));
  }

  let query = '';
  let results = [];
  const revealedAnswers = new Set();

  function search() {
    const q = fold(query.trim());
    if (q.length < 3) { results = []; return; }
    results = all.filter((question) =>
      fold(question.text_it).includes(q) || fold(translationOf(question)).includes(q),
    ).slice(0, 60);
  }

  const input = el('input', {
    id: 'search-input',
    type: 'search',
    placeholder: 'e.g. precedenza, tunnel, дистанция…',
    autocomplete: 'off',
    oninput: (e) => {
      query = e.target.value;
      revealedAnswers.clear();
      search();
      drawResults();
    },
  });

  const resultsBox = el('div', {});

  function startPractice() {
    renderQuizSession(root, shuffle(results).slice(0, PRACTICE_BATCH), {
      title: 'SEARCH PRACTICE',
      backHash: '#/search',
      onQuit: () => renderSearch(root),
      onFinish: () => renderSearch(root),
    });
  }

  function drawResults() {
    const q = fold(query.trim());
    if (q.length < 3) {
      resultsBox.replaceChildren(
        el('p.empty-note', {}, 'Type at least 3 characters. Search covers Italian and your language.'),
      );
      return;
    }
    if (!results.length) {
      resultsBox.replaceChildren(el('p.empty-note', {}, `Nothing found for «${query.trim().toUpperCase()}»`));
      return;
    }
    resultsBox.replaceChildren(
      el('div.quiz-head', {},
        el('span.tag', {}, `${results.length}${results.length === 60 ? '+' : ''} RESULTS`),
        el('button.btn.btn-small.btn-primary', { onclick: startPractice },
          `PRACTICE THESE (${Math.min(results.length, PRACTICE_BATCH)})`),
      ),
      ...results.map((question, i) =>
        el('div.row', {},
          question.image_url
            ? el('img.search-sign', { src: question.image_url, alt: '', loading: 'lazy' })
            : null,
          el('span', { style: 'flex:1' }, question.text_it),
          revealedAnswers.has(i)
            ? el('span.tag', { className: `tag ${question.is_true ? 'ok' : 'bad'}` },
                question.is_true ? 'VERO' : 'FALSO')
            : el('button.btn.btn-small', {
                onclick: () => { revealedAnswers.add(i); drawResults(); },
              }, 'ANSWER'),
        ),
      ),
    );
  }

  clear(root,
    el('div.quiz-head', {},
      el('h1', { style: 'margin:0' }, 'SEARCH'),
      el('a.btn', { href: '#/practice' }, '← PRACTICE'),
    ),
    el('p.lede', {}, `All ${all.length} questions. Find a wording, check the answer, practice the results.`),
    el('div.panel', {},
      el('div.field', { style: 'margin:0' },
        el('label', { htmlFor: 'search-input' }, 'FIND IN QUESTIONS'),
        input,
      ),
    ),
    el('div.panel', {}, resultsBox),
  );
  drawResults();
  input.focus();
}

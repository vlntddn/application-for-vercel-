// Dictionary screen, extracted from views.js (Sprint 1, S1.5) — pure code move, no behavior change.
import { loadDictionary } from '../state.js';
import { el, clear } from '../ui.js';
import { errorBanner, lang } from './common.js';

/* ============================== DICTIONARY ============================== */

export async function renderDictionary(root, sectionId) {
  clear(root, el('h1', {}, 'DIZIONARIO'), el('p.lede', {}, 'LOADING...'));
  let dictionary;
  try {
    dictionary = await loadDictionary();
  } catch (err) {
    return clear(root, errorBanner(err));
  }

  // Self-test mode hides every translation; tap a row to reveal just it.
  let selfTest = false;
  const revealedTerms = new Set();

  function termRow(sec, idx, term) {
    const key = `${sec.id}:${idx}`;
    const hidden = selfTest && !revealedTerms.has(key);
    const revealTerm = () => { revealedTerms.add(key); draw(); };
    return el('div.row.term-row', {
      className: `row term-row ${hidden ? 'is-hidden' : ''}`,
      onclick: hidden ? revealTerm : undefined,
      role: hidden ? 'button' : undefined,
      tabIndex: hidden ? 0 : undefined,
      'aria-label': hidden ? `Reveal translation of ${term.it}` : undefined,
      onkeydown: hidden ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); revealTerm(); }
      } : undefined,
    },
      el('strong.term-it', {}, term.it),
      hidden
        ? el('span.term-veil', {}, 'TAP TO REVEAL')
        : el('span.term-tr', {}, term[lang()] || term.en),
    );
  }

  function draw() {
    clear(root,
      el('h1', {}, 'DIZIONARIO'),
      el('p.lede', {}, 'THE EXAM VOCABULARY, BY TOPIC. LEARN THE ITALIAN TERM — THE EXAM HAS NO TRANSLATIONS.'),
      el('div.actions', { style: 'margin:0 0 24px' },
        el('a.btn', { href: '#/theory' }, '← THEORY'),
        el('button.btn', {
          className: `btn ${selfTest ? 'btn-primary' : ''}`,
          onclick: () => { selfTest = !selfTest; revealedTerms.clear(); draw(); },
        }, selfTest ? 'SELF-TEST: ON' : 'SELF-TEST: OFF'),
      ),
      ...dictionary.sections.map((sec) =>
        el('div.panel', { id: `dict-${sec.id}` },
          el('div.quiz-head', {},
            el('h2', { style: 'margin:0' }, sec.title_it),
            el('span.tag', {}, `${sec.terms.length} TERMS`),
          ),
          el('p.stat-sub', { style: 'margin-bottom:10px' }, (sec.titles?.[lang()] || '').toUpperCase()),
          ...sec.terms.map((t, i) => termRow(sec, i, t)),
        ),
      ),
    );
    if (sectionId) {
      document.getElementById(`dict-${sectionId}`)?.scrollIntoView({ block: 'start' });
      sectionId = null; // only on first draw
    }
  }

  draw();
}

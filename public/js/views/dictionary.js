// Dictionary screen, extracted from views.js (Sprint 1, S1.5) — pure code move, no behavior change.
import { loadDictionary } from '../state.js';
import { el, clear } from '../ui.js';
import { t } from '../i18n.js';
import { errorBanner, lang } from './common.js';

/* ============================== DICTIONARY ============================== */

export async function renderDictionary(root, sectionId) {
  clear(root, el('h1', {}, t('dict.title')), el('p.lede', {}, t('dict.loading')));
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
      'aria-label': hidden ? t('dict.revealAria', { term: term.it }) : undefined,
      onkeydown: hidden ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); revealTerm(); }
      } : undefined,
    },
      el('strong.term-it', {}, term.it),
      hidden
        ? el('span.term-veil', {}, t('dict.tapToReveal'))
        : el('span.term-tr', {}, term[lang()] || term.en),
    );
  }

  function draw() {
    clear(root,
      el('h1', {}, t('dict.title')),
      el('p.lede', {}, t('dict.lede')),
      el('div.actions', { style: 'margin:0 0 24px' },
        el('a.btn', { href: '#/theory' }, t('dict.backTheory')),
        el('button.btn', {
          className: `btn ${selfTest ? 'btn-primary' : ''}`,
          onclick: () => { selfTest = !selfTest; revealedTerms.clear(); draw(); },
        }, selfTest ? t('dict.selfTestOn') : t('dict.selfTestOff')),
      ),
      ...dictionary.sections.map((sec) =>
        el('div.panel', { id: `dict-${sec.id}` },
          el('div.quiz-head', {},
            el('h2', { style: 'margin:0' }, sec.title_it),
            el('span.tag', {}, t('dict.terms', { n: sec.terms.length })),
          ),
          el('p.stat-sub', { style: 'margin-bottom:10px' }, sec.titles?.[lang()] || ''),
          ...sec.terms.map((term, i) => termRow(sec, i, term)),
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

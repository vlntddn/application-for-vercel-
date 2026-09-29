import { api } from '../api.js';
import { state, loadTheory, loadDictionary, loadLessons, loadQuestions } from '../state.js';
import { el, clear } from '../ui.js';
import { CHAPTER_CATEGORY } from '../theory-map.js';
import { translationOf, lang, loc, pickQueue, masteryOf, errorBanner } from './common.js';
import { renderQuizSession } from '../views.js';

function showSignModal(imageUrl, signQuestions, onPractice) {
  const facts = signQuestions.filter((q) => q.is_true).slice(0, 4);
  let revealed = false;
  const opener = document.activeElement; // restore focus here on close

  const overlay = el('div.modal-overlay', {
    onclick: (e) => { if (e.target === overlay) close(); },
  });

  function close() {
    document.removeEventListener('keydown', escHandler);
    overlay.remove();
    if (opener instanceof HTMLElement) opener.focus();
  }

  function escHandler(e) {
    if (e.key === 'Escape') close();
    if (e.key.toLowerCase() === 't' && !revealed) { revealed = true; draw(); }
  }
  document.addEventListener('keydown', escHandler);

  function draw() {
    overlay.replaceChildren(
      el('div.modal', { role: 'dialog', 'aria-modal': 'true' },
        el('div.quiz-head', {},
          el('h2', { style: 'margin:0' }, 'WHAT THIS SIGN MEANS'),
          el('button.btn.btn-icon', { onclick: close, 'aria-label': 'Close' }, '✕'),
        ),
        el('img.modal-sign', { src: imageUrl, alt: 'Road sign' }),
        facts.length
          ? el('div', {},
              ...facts.map((q) =>
                el('div.fact', {},
                  el('p', {}, q.text_it),
                  revealed && translationOf(q)
                    ? el('p.fact-translation', {}, translationOf(q))
                    : null,
                ),
              ),
              !revealed
                ? el('button.btn.btn-small.btn-translate', {
                    onclick: () => { revealed = true; draw(); },
                  }, `TRANSLATE (${lang().toUpperCase()})`)
                : null,
            )
          : el('p.empty-note', {}, 'No description in the question bank'),
        el('div.actions', {},
          el('button.btn.btn-primary', {
            onclick: () => { close(); onPractice(); },
          }, `PRACTICE THIS SIGN — ${signQuestions.length} QUESTIONS`),
          el('button.btn', { onclick: close }, 'CLOSE'),
        ),
      ),
    );
  }

  draw();
  document.body.append(overlay);
  overlay.querySelector('button[aria-label="Close"]')?.focus();
}

/* ============================== THEORY ============================== */

export async function renderTheoryList(root) {
  clear(root, el('h1', {}, 'THEORY MANUAL'), el('p.lede', {}, 'Loading...'));
  let chapters;
  try {
    chapters = await loadTheory();
  } catch (err) {
    return clear(root, errorBanner(err));
  }
  const read = new Set(state.progress.theoryRead);
  const readPct = Math.round((read.size / chapters.length) * 100);
  const firstUnread = chapters.find((c) => !read.has(c.id));
  const catBySlug = new Map(state.manifest.categories.map((c) => [c.slug, c]));
  let lessonChapters = new Set();
  try {
    lessonChapters = new Set(Object.keys((await loadLessons()).chapters || {}));
  } catch {
    /* list still renders without the lesson layer */
  }

  clear(root,
    el('h1', {}, 'THEORY MANUAL'),
    el('p.lede', {}, 'Read the Italian first — translate only when stuck.'),
    el('div.panel', {},
      el('div.quiz-head', {},
        el('h2', { style: 'margin:0' }, 'READING PROGRESS'),
        el('span.tag', { className: `tag ${read.size === chapters.length ? 'ok' : ''}` },
          `${read.size}/${chapters.length} CHAPTERS`),
      ),
      el('div.bar', { 'aria-hidden': 'true' }, el('div', { style: `width:${readPct}%` })),
      el('div.actions', {},
        firstUnread
          ? el('a.btn.btn-primary', { href: `#/theory/${firstUnread.id}` },
              `CONTINUE — CHAPTER ${firstUnread.chapter}`)
          : null,
        el('a.btn', { href: '#/dictionary' }, 'DIZIONARIO — EXAM VOCABULARY'),
      ),
    ),
    el('a.panel.exam-italian-banner', { href: '#/exam-italian' },
      el('div.quiz-head', { style: 'margin:0' },
        el('div', {},
          el('h2', { style: 'margin-bottom:4px' }, "L'ITALIANO DELL'ESAME"),
          el('p.stat-sub', {},
            'Sempre · Mai · Solo · Deve · Può — the words that decide VERO or FALSO. Read the lesson first.'),
        ),
        el('span.tag', {}, 'LESSON'),
      ),
    ),
    el('div.grid.grid-2', {},
      ...chapters.map((ch) => {
        const slug = CHAPTER_CATEGORY[ch.id];
        const cat = catBySlug.get(slug);
        const m = cat ? masteryOf(slug, cat.count) : null;
        return el('a.card', { href: `#/theory/${ch.id}` },
          el('div.quiz-head', {},
            el('span.tag', {}, `CHAPTER ${ch.chapter}`),
            el('span', { style: 'display:flex;gap:6px' },
              lessonChapters.has(ch.id) ? el('span.tag.accent-tag', {}, 'LESSON') : null,
              read.has(ch.id) ? el('span.tag.ok', {}, 'READ') : el('span.tag.warn', {}, 'NEW'),
            ),
          ),
          el('h2', {}, ch.title_it),
          el('p.stat-sub', {}, ch.translations?.[lang()]?.title || ''),
          m
            ? el('div', {},
                el('p.stat-sub', {}, `${cat.count} questions · mastered ${m.pct}%`),
                el('div.bar', { 'aria-hidden': 'true' }, el('div', { style: `width:${m.pct}%` })),
              )
            : null,
        );
      }),
    ),
  );
}

export async function renderTheoryChapter(root, id, opts = {}) {
  let chapters;
  try {
    chapters = await loadTheory();
  } catch (err) {
    return clear(root, errorBanner(err));
  }
  const ch = chapters.find((c) => c.id === id);
  if (!ch) return clear(root, el('p.empty-note', {}, 'Chapter not found'));
  const tr = ch.translations?.[lang()];

  // Linked question-bank topic: powers the signs gallery and self-check.
  const slug = CHAPTER_CATEGORY[ch.id];
  const cat = state.manifest.categories.find((c) => c.slug === slug);
  let catQuestions = [];
  if (cat) {
    try {
      catQuestions = await loadQuestions(slug);
    } catch {
      /* chapter still readable without the question bank */
    }
  }
  const signs = [...new Set(catQuestions.map((q) => q.image_url).filter(Boolean))].slice(0, 18);
  let lesson = null;
  try {
    lesson = (await loadLessons()).chapters?.[ch.id] || null;
  } catch {
    /* chapter still readable without the lesson layer */
  }
  // Traps quote real bank questions; resolve them so text/image/answer
  // can never drift from the data. Unresolvable ids are dropped.
  const traps = (lesson?.traps || [])
    .map((t) => ({ ...t, q: catQuestions.find((q) => q.id === t.id) }))
    .filter((t) => t.q);
  const trapRevealed = new Set();
  let dictionary = { sections: [] };
  try {
    dictionary = await loadDictionary();
  } catch {
    /* chapter still readable without the dictionary */
  }
  const vocabSections = dictionary.sections.filter((s) => s.chapters.includes(ch.id));
  const sorted = [...chapters].sort((a, b) => a.chapter - b.chapter);
  const pos = sorted.indexOf(ch);
  const prev = sorted[pos - 1];
  const next = sorted[pos + 1];

  // Translation stays hidden until asked for: read the Italian first.
  let revealed = false;

  function keyHandler(e) {
    if (e.key.toLowerCase() === 't' && !revealed) {
      revealed = true;
      draw();
    }
  }
  document.addEventListener('keydown', keyHandler);
  window.addEventListener('hashchange', () => document.removeEventListener('keydown', keyHandler), { once: true });

  function startCheck() {
    document.removeEventListener('keydown', keyHandler);
    renderQuizSession(root, pickQueue(catQuestions, 5), {
      title: `CHECK — CAP. ${ch.chapter}`,
      backHash: `#/theory/${id}`,
      onQuit: () => renderTheoryChapter(root, id),
      onFinish: (correct, total) => renderTheoryChapter(root, id, { quizResult: { correct, total } }),
    });
  }

  async function markRead(e) {
    try {
      const { theoryRead } = await api.markTheoryRead(ch.id);
      state.progress.theoryRead = theoryRead;
      draw();
    } catch (err) {
      e.target.replaceWith(errorBanner(err));
    }
  }

  function draw() {
    const isRead = state.progress.theoryRead.includes(ch.id);
    const m = cat ? masteryOf(slug, cat.count) : null;
    clear(root,
      el('div.quiz-head', {},
        el('a.btn', { href: '#/theory' }, '← ALL CHAPTERS'),
        el('span.tag', {}, `CHAPTER ${ch.chapter}/${sorted.length}`),
        isRead ? el('span.tag.ok', {}, 'READ') : el('span.tag.warn', {}, 'NEW'),
      ),
      el('h1', { style: 'margin-top:20px' }, ch.title_it),
      revealed && tr?.title ? el('p.lede', {}, tr.title) : null,

      opts.quizResult
        ? el('div.ds-feedback', {
            className: `ds-feedback ${opts.quizResult.correct === opts.quizResult.total ? 'ds-feedback--ok' : 'ds-feedback--bad'}`,
            style: 'margin:0 0 20px',
          }, `Self-check: ${opts.quizResult.correct}/${opts.quizResult.total} correct`)
        : null,

      lesson
        ? el('div.panel.lesson-objective', {},
            el('h2', {}, 'IN THIS LESSON'),
            el('p.lede', { style: 'margin:0' }, loc(lesson.objective)),
          )
        : null,

      lesson?.keyIdeas?.length
        ? el('div.panel', {},
            el('h2', {}, 'KEY IDEAS'),
            ...lesson.keyIdeas.map((idea, i) =>
              el('div.key-idea', {},
                el('div.key-idea-num', {}, String(i + 1)),
                el('div', {},
                  el('strong.key-idea-title', {}, idea.title_it),
                  el('p.key-idea-text', {}, loc(idea.text)),
                ),
              ),
            ),
          )
        : null,

      el('div.panel.chapter-body', {},
        el('h2', {}, 'ORIGINAL TEXT (ITALIAN)'),
        el('p', {}, ch.content_it),
        revealed && tr?.content
          ? el('div.translation-block', {}, el('strong', {}, 'Translation — '), tr.content)
          : null,
        revealed && tr?.simple_it
          ? el('div.simple-block', {}, el('strong', {}, 'In simple words — '), tr.simple_it)
          : null,
        !revealed && (tr?.content || tr?.simple_it)
          ? el('button.btn.btn-small.btn-translate', {
              onclick: () => { revealed = true; draw(); },
            }, `TRANSLATE (${lang().toUpperCase()})`)
          : null,
      ),

      lesson?.mustKnow?.length
        ? el('div.panel', {},
            el('h2', {}, 'MUST KNOW — NUMBERS & FACTS'),
            ...lesson.mustKnow.map((f) =>
              el('div.row', {},
                el('div', { style: 'flex:1' },
                  el('strong', {}, f.fact_it),
                  f.note ? el('p.stat-sub', {}, loc(f.note)) : null,
                ),
                el('span.tag.must-value', {}, f.value.toUpperCase()),
              ),
            ),
          )
        : null,

      traps.length
        ? el('div.panel.traps-panel', {},
            el('h2', {}, 'HOW THE EXAM TRICKS YOU HERE'),
            el('p.stat-sub', { style: 'margin-bottom:14px' },
              'Real exam questions. Decide VERO or FALSO, then reveal the trap.'),
            ...traps.map((t, i) =>
              el('div.trap', {},
                t.q.image_url
                  ? el('img.trap-img', { src: t.q.image_url, alt: 'Road sign', loading: 'lazy' })
                  : null,
                el('p.trap-text', {}, `«${t.q.text_it}»`),
                trapRevealed.has(i)
                  ? el('div.trap-answer', {},
                      el('span.tag', { className: `tag ${t.q.is_true ? 'ok' : 'bad'}` },
                        t.q.is_true ? 'VERO' : 'FALSO'),
                      el('p.trap-why', {}, loc(t.why)),
                    )
                  : el('button.btn.btn-small', {
                      onclick: () => { trapRevealed.add(i); draw(); },
                    }, 'REVEAL THE TRAP'),
              ),
            ),
            el('div.actions', {},
              el('a.btn.btn-small', { href: '#/exam-italian' }, 'FULL GUIDE: THE ITALIAN OF THE EXAM →'),
            ),
          )
        : null,

      signs.length
        ? el('div.panel', {},
            el('h2', {}, `SIGNS IN THIS CHAPTER — ${signs.length}`),
            el('p.stat-sub', { style: 'margin-bottom:12px' }, 'TAP A SIGN TO SEE WHAT IT MEANS'),
            el('div.signs-grid', {},
              ...signs.map((src) =>
                el('button.sign-tile', {
                  'aria-label': 'Show sign description',
                  onclick: () => {
                    const signQuestions = catQuestions.filter((q) => q.image_url === src);
                    showSignModal(src, signQuestions, () => {
                      document.removeEventListener('keydown', keyHandler);
                      renderQuizSession(root, pickQueue(signQuestions, signQuestions.length), {
                        title: 'SIGN PRACTICE',
                        backHash: `#/theory/${id}`,
                        onQuit: () => renderTheoryChapter(root, id),
                        onFinish: (correct, total) =>
                          renderTheoryChapter(root, id, { quizResult: { correct, total } }),
                      });
                    });
                  },
                }, el('img', { src, alt: 'Road sign', loading: 'lazy', onerror: (e) => e.target.closest('button').remove() })),
              ),
            ),
          )
        : null,

      vocabSections.length
        ? el('div.panel', {},
            el('h2', {}, 'VOCABULARY OF THIS CHAPTER'),
            ...vocabSections.map((s) =>
              el('div.row', {},
                el('div', {},
                  el('strong', {}, s.title_it),
                  el('p.stat-sub', {}, `${s.terms.length} TERMS · ${s.titles?.[lang()] || ''}`),
                ),
                el('a.btn.btn-small', { href: `#/dictionary/${s.id}` }, 'OPEN'),
              ),
            ),
          )
        : null,

      cat
        ? el('div.panel', {},
            el('h2', {}, 'CHECK YOURSELF'),
            el('p.stat-sub', {}, `${cat.count} QUESTIONS IN THIS TOPIC · MASTERED ${m.mastered} (${m.pct}%)`),
            el('div.bar', { 'aria-hidden': 'true' }, el('div', { style: `width:${m.pct}%` })),
            el('div.actions', {},
              el('button.btn.btn-primary', { onclick: startCheck }, 'QUICK CHECK — 5 QUESTIONS'),
              el('a.btn', { href: `#/practice/${slug}` }, 'FULL PRACTICE'),
            ),
          )
        : null,

      el('div.actions', {},
        isRead
          ? el('span.tag.ok', {}, 'MARKED AS READ')
          : el('button.btn.btn-primary', { onclick: markRead }, 'MARK AS READ'),
      ),
      el('div.chapter-nav', {},
        prev
          ? el('a.btn', { href: `#/theory/${prev.id}` }, `← CAP. ${prev.chapter}`)
          : el('span', {}),
        next
          ? el('a.btn', { href: `#/theory/${next.id}` }, `CAP. ${next.chapter} →`)
          : el('span', {}),
      ),
    );
  }

  draw();
}

/* ========================== EXAM ITALIAN GUIDE ========================== */

/**
 * L1b — bank data under an absolute word: the FALSO fraction ("3 of 4 are
 * FALSO"), a real VERO counter-example behind a button, and a one-line
 * takeaway. `bankStats` comes from data/lessons.json (built by
 * scripts/build-insights.mjs); entries without it render plain.
 */
function absoluteWordData(w, bankStat) {
  const { questions, falseRatio, firstTrue, takeaway } = w.bankStats;
  const nodes = [];
  if (questions) {
    const revealed = falseRatio >= 0.5;
    const falseCount = Math.round(falseRatio * questions);
    const wordKey = revealed ? 'falso' : 'vero';
    nodes.push(el('p.word-stat', {},
      loc(bankStat.template).replace('{f}', String(falseCount))
        .replace('{n}', String(questions)).replace('{word}', loc(bankStat[wordKey])),
    ));
    if (firstTrue) {
      nodes.push(el('details.word-true', {},
        el('summary', {}, loc(bankStat.showTrue)),
        el('p.word-true-q', {}, `«${firstTrue.text_it}»`),
        el('span.tag.ok', {}, 'VERO'),
      ));
    }
  }
  if (takeaway) nodes.push(el('p.word-takeaway', {}, loc(takeaway)));
  return nodes;
}

/**
 * A language survival guide for the quiz: the small set of Italian words
 * and sentence patterns that decide VERO/FALSO. This is the single most
 * valuable page for non-Italian speakers.
 */
export async function renderExamItalian(root) {
  clear(root, el('h1', {}, "L'ITALIANO DELL'ESAME"), el('p.lede', {}, 'Loading...'));
  let guide;
  try {
    guide = (await loadLessons()).examItalian;
  } catch (err) {
    return clear(root, errorBanner(err));
  }

  clear(root,
    el('div.quiz-head', {},
      el('h1', { style: 'margin:0' }, "L'ITALIANO DELL'ESAME"),
      el('a.btn', { href: '#/theory' }, '← THEORY'),
    ),
    el('p.lede', {}, 'The words that decide VERO or FALSO.'),
    el('div.panel.lesson-objective', {},
      el('p', { style: 'margin:0;font-weight:600' }, loc(guide.intro)),
    ),
    ...guide.sections.map((s) =>
      el('div.panel', {},
        el('h2', {}, s.title_it.toUpperCase()),
        el('p.section-explain', {}, loc(s.explain)),
        el('div.word-grid', {},
          ...s.entries.map((w) => {
            const card = el('div.word-card', {},
              el('strong.word-it', {}, w.it),
              el('span.word-gloss', {}, loc(w.gloss)),
            );
            if (w.bankStats && guide.bankStat) card.append(...absoluteWordData(w, guide.bankStat));
            return card;
          }),
        ),
      ),
    ),
    el('div.panel.traps-panel', {},
      el('h2', {}, "INSTRUCTOR'S RULES OF THUMB"),
      ...guide.tips.map((t, i) =>
        el('div.key-idea', {},
          el('div.key-idea-num', {}, String(i + 1)),
          el('p.key-idea-text', { style: 'margin:0' }, loc(t)),
        ),
      ),
    ),
    el('div.actions', {},
      el('a.btn.btn-primary', { href: '#/practice' }, 'APPLY IT — PRACTICE NOW'),
      el('a.btn', { href: '#/drill/signals' }, 'SIGNAL-WORD DRILL'),
    ),
  );
}

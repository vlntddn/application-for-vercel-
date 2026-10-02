// S3.9b — screen «Records» (#/records), linked from #/stats.
// Lifelong bests: the longest streak (S3.9a), the best mock exam, the total
// number of answers, and the dictionary size for the self-test.
import { state, loadDictionary } from '../state.js';
import { el, clear, fmtDate } from '../ui.js';
import { t } from '../i18n.js';
import { errorBanner } from './common.js';

function statCard(label, value, sub) {
  return el('div.ds-stat', {},
    el('span.ds-stat__label', {}, label),
    el('span.ds-stat__value', {}, value),
    el('p.ds-stat__sub', {}, sub),
  );
}

export async function renderRecords(root) {
  clear(root, el('h1', {}, t('rd.title')), el('p.lede', {}, t('rd.lede')));
  let dictionary;
  try {
    dictionary = await loadDictionary();
  } catch (err) {
    return clear(root, errorBanner(err));
  }

  const { stats, exams } = state.progress;

  // Best mock exam = the one with the fewest errors; ties broken by score
  // percentage are irrelevant because errors alone order them.
  let bestExam = null;
  for (const e of exams) {
    if (!bestExam || e.errors < bestExam.errors) bestExam = e;
  }
  const terms = dictionary.sections.reduce((n, sec) => n + (sec.terms?.length || 0), 0);

  clear(root,
    el('div.quiz-head', {},
      el('h1', { style: 'margin:0' }, t('rd.title')),
      el('a.btn', { href: '#/stats' }, t('rd.backStats')),
    ),
    el('p.lede', {}, t('rd.lede')),

    el('div.ds-stat-row ds-stat-row--records', {},
      statCard(t('rd.streak'), String(stats.streakBest ?? 0), t('rd.streakSub')),
      statCard(t('rd.bestExam'), bestExam ? `${bestExam.total - bestExam.errors}/${bestExam.total}` : '—',
        bestExam ? t('rd.bestExamSub', { errors: bestExam.errors, date: fmtDate(bestExam.date) }) : t('rd.noExams')),
      statCard(t('rd.totalAnswers'), String(stats.answered ?? 0), t('rd.answersSub')),
      statCard(t('rd.terms'), String(terms), t('rd.termsSub')),
    ),
  );
}

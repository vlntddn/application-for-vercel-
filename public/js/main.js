import { boot, state } from './state.js';
import { el, clear } from './ui.js';
import {
  renderOnboarding,
  renderDashboard,
  renderTheoryList,
  renderTheoryChapter,
  renderStats,
  renderQuickReview,
  renderSearch,
  renderExamItalian,
  renderDictionary,
  renderPracticeList,
  renderPracticeSession,
  renderMistakes,
  renderExam,
  renderSettings,
} from './views.js';

const view = document.getElementById('view');
const nav = document.getElementById('nav');

const routes = [
  { pattern: /^#?\/?$/, name: 'dashboard', render: () => renderDashboard(view) },
  { pattern: /^#\/stats$/, name: 'dashboard', render: () => renderStats(view) },
  { pattern: /^#\/theory$/, name: 'theory', render: () => renderTheoryList(view) },
  { pattern: /^#\/theory\/([\w-]+)$/, name: 'theory', render: (m) => renderTheoryChapter(view, m[1]) },
  { pattern: /^#\/exam-italian$/, name: 'theory', render: () => renderExamItalian(view) },
  { pattern: /^#\/dictionary$/, name: 'theory', render: () => renderDictionary(view) },
  { pattern: /^#\/dictionary\/([\w-]+)$/, name: 'theory', render: (m) => renderDictionary(view, m[1]) },
  { pattern: /^#\/search$/, name: 'practice', render: () => renderSearch(view) },
  { pattern: /^#\/practice$/, name: 'practice', render: () => renderPracticeList(view) },
  { pattern: /^#\/practice\/([\w-]+)$/, name: 'practice', render: (m) => renderPracticeSession(view, m[1]) },
  { pattern: /^#\/exam$/, name: 'exam', render: () => renderExam(view) },
  { pattern: /^#\/review$/, name: 'practice', render: () => renderQuickReview(view) },
  { pattern: /^#\/mistakes$/, name: 'mistakes', render: () => renderMistakes(view) },
  { pattern: /^#\/settings$/, name: 'settings', render: () => renderSettings(view) },
];

function route() {
  if (!state.progress.profile.onboarded) {
    nav.style.display = 'none';
    renderOnboarding(view, () => {
      nav.style.display = '';
      location.hash = '#/';
      route();
    });
    return;
  }
  nav.style.display = '';
  const hash = location.hash || '#/';
  const match = routes
    .map((r) => ({ r, m: hash.match(r.pattern) }))
    .find((x) => x.m);
  if (!match) {
    location.hash = '#/';
    return;
  }
  for (const a of nav.querySelectorAll('a')) {
    const active = a.dataset.route === match.r.name;
    a.classList.toggle('active', active);
    if (active) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  window.scrollTo(0, 0);
  match.r.render(match.m);
}

window.addEventListener('hashchange', route);

// Offline support: the service worker caches the shell and study data.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {
    /* app works fine without it */
  });
}

boot()
  .then(route)
  .catch((err) => {
    clear(view,
      el('div.panel', {},
        el('h1', {}, 'SERVER UNREACHABLE'),
        el('p.lede', {}, `COULD NOT LOAD APP DATA: ${err.message}`),
        el('button.btn.btn-primary', { onclick: () => location.reload() }, 'RETRY'),
      ),
    );
  });

import { boot, state, flushQueue, scheduleQueueRetry } from './state.js';
import { api } from './api.js';
import { el, clear } from './ui.js';
import { setLang } from './i18n.js';
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
  renderSignalDrill,
  renderNumbers,
  renderPath,
} from './views.js';

const view = document.getElementById('view');
const nav = document.getElementById('nav');

const routes = [
  { pattern: /^#?\/?$/, name: 'dashboard', render: () => renderDashboard(view) },
  { pattern: /^#\/stats$/, name: 'dashboard', render: () => renderStats(view) },
  { pattern: /^#\/path$/, name: 'dashboard', render: () => renderPath(view) },
  { pattern: /^#\/theory$/, name: 'theory', render: () => renderTheoryList(view) },
  { pattern: /^#\/theory\/([\w-]+)\/check$/, name: 'theory', render: (m) => renderTheoryChapter(view, m[1], { check: true }) },
  { pattern: /^#\/theory\/([\w-]+)$/, name: 'theory', render: (m) => renderTheoryChapter(view, m[1]) },
  { pattern: /^#\/exam-italian$/, name: 'theory', render: () => renderExamItalian(view) },
  { pattern: /^#\/dictionary$/, name: 'theory', render: () => renderDictionary(view) },
  { pattern: /^#\/dictionary\/([\w-]+)$/, name: 'theory', render: (m) => renderDictionary(view, m[1]) },
  { pattern: /^#\/search$/, name: 'practice', render: () => renderSearch(view) },
  { pattern: /^#\/practice$/, name: 'practice', render: () => renderPracticeList(view) },
  { pattern: /^#\/practice\/([\w-]+)$/, name: 'practice', render: (m) => renderPracticeSession(view, m[1]) },
  { pattern: /^#\/drill\/signals$/, name: 'practice', render: () => renderSignalDrill(view) },
  { pattern: /^#\/numbers$/, name: 'practice', render: () => renderNumbers(view) },
  { pattern: /^#\/exam$/, name: 'exam', render: () => renderExam(view) },
  { pattern: /^#\/review$/, name: 'practice', render: () => renderQuickReview(view) },
  { pattern: /^#\/mistakes$/, name: 'mistakes', render: () => renderMistakes(view) },
  { pattern: /^#\/settings$/, name: 'settings', render: () => renderSettings(view) },
];

function route() {
  // Keep the i18n module in sync with the stored profile (Q4.1).
  setLang(state.progress.profile?.language);
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
  // S2.7: on phones the Settings tab lives behind the masthead gear — keep it
  // highlighted too so the current page is never ambiguous.
  const gear = document.querySelector('.settings-gear');
  if (gear) gear.classList.toggle('active', match.r.name === 'settings');
  // S2.7: the Mistakes tab shows the count of open mistakes (badge).
  const badge = document.getElementById('nav-mistakes-badge');
  if (badge) {
    const n = (state.progress.mistakes || []).length;
    badge.textContent = n > 99 ? '99+' : String(n);
    badge.hidden = n === 0;
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

// Queued work is replayed when connectivity returns, when the user comes
// back to the tab, and on a timer while anything is still pending.
window.addEventListener('online', () => flushQueue());
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') flushQueue().then((done) => {
    if (!done) scheduleQueueRetry();
  });
});

// Privacy notice (S2.5): one dismissible strip for both modes — progress
// never leaves the device, whether it lives on the local server or in the
// browser. Restore the dismissed state as early as the module loads so the
// strip does not flash before the first route.
(function dismissPrivacyNoticeIfStored() {
  const notice = document.getElementById('privacy-notice');
  try {
    if (localStorage.getItem('pp-privacy-notice') === '1') notice?.remove();
  } catch { /* private mode: notice just stays visible */ }
  notice?.querySelector('#privacy-notice-ok')?.addEventListener('click', () => {
    notice.remove();
    try { localStorage.setItem('pp-privacy-notice', '1'); } catch { /* no persistence */ }
  });
})();

boot()
  .then(async () => {
    // Drain answers queued in a previous offline session, then render
    // with the server's authoritative snapshot. Never blocks startup.
    try {
      if (await flushQueue()) state.progress = await api.progress();
      else scheduleQueueRetry();
    } catch {
      /* keep the boot snapshot */
    }
  })
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

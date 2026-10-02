import { boot, state, flushQueue, scheduleQueueRetry } from './state.js';
import { api } from './api.js';
import { el, clear } from './ui.js';
import { setLang, t } from './i18n.js';
import {
  renderOnboarding,
  renderDashboard,
  renderTheoryList,
  renderTheoryChapter,
  renderStats,
  renderRecords,
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
  { pattern: /^#\/records$/, name: 'records', render: () => renderRecords(view) },
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
// S3.1: when a newer worker is installed while this tab is running, offer a
// "New version available" strip (no external requests). Silent when offline.
if ('serviceWorker' in navigator) {
  let newVersionBanner = null;

  function showNewVersionBanner() {
    if (newVersionBanner) return;
    newVersionBanner = el('div.ds-notice.ds-notice--new', { id: 'new-version-banner' },
      el('span', {}, t('nv.title')),
      el('button.ds-notice__btn', { onclick: () => location.reload() }, t('nv.reload')));
    document.body.insertBefore(newVersionBanner, view);
  }

  navigator.serviceWorker
    .addEventListener('updatefound', () => {
      const worker = navigator.serviceWorker.registration?.installing;
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        // Only an upgrade (an older worker still controls the page) is a
        // "new version" — the very first install has no controller yet.
        if (worker.state === 'installed' && navigator.serviceWorker.controller && navigator.onLine) {
          showNewVersionBanner();
        }
      });
    });

  navigator.serviceWorker.register('/sw.js').catch(() => {
    /* app works fine without it */
  });

  // Re-check for a newer build when the tab becomes visible, at most once
  // every 10 minutes. Offline: update() is a no-op, so stay silent.
  let lastUpdateCheck = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !navigator.onLine) return;
    const now = Date.now();
    if (now - lastUpdateCheck < 10 * 60 * 1000) return;
    lastUpdateCheck = now;
    navigator.serviceWorker.registration?.update().catch(() => {
      /* offline or transient — try again on the next visible turn */
    });
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
        el('h1', {}, t('err.title')),
        el('p.lede', {}, t('err.lede', { err: err.message })),
        el('button.btn.btn-primary', { onclick: () => location.reload() }, t('err.retry')),
      ),
    );
  });

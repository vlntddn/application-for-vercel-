// Settings → "About" + "Danger zone" panels (ST2).
import { state, applyTheme } from '../../state.js';
import { el } from '../../ui.js';
import { t } from '../../i18n.js';
import { api } from '../../api.js';
import { errorBanner, feedbackHref, FEEDBACK_EMAIL } from '../common.js';

/**
 * The app version, read from public/sw.js (its VERSION constant) — no
 * network request beyond the cached shell file. Caches the *promise* so the
 * function is idempotent: re-renders of the settings screen (e.g. on
 * hashchange) call it again and must still get a thenable, not the resolved
 * string (a prior version returned the cached string and `.then` crashed).
 */
let versionPromise = null;
export function appVersion() {
  if (versionPromise === null) {
    versionPromise = fetch('/sw.js').then((res) => res.text()).then((text) => {
      const m = text.match(/const VERSION = '([^']+)'/);
      return m;
    }).catch(() => null);
  }
  return versionPromise;
}

export function helpPanel() {
  return el('div.panel', {},
    el('h2', {}, t('st.help')),
    el('p.lede', {}, t('st.feedbackLede')),
    el('div.actions', {},
      el('a.btn.btn-primary', { href: feedbackHref('Passo feedback') }, t('st.writeUs')),
    ),
    el('p.stat-sub', {}, FEEDBACK_EMAIL),
  );
}

export function aboutPanel() {
  const panel = el('div.panel', {},
    el('h2', {}, t('st.about')),
    el('div.row', {},
      el('div', { style: 'flex:1' },
        el('strong', {}, 'PASSO'),
        el('p.stat-sub', { id: 'app-version' }, t('st.version', { v: '' })),
        el('p.stat-sub', {}, t('st.aboutStats')),
      ),
    ),
    el('div.actions', {},
      el('a.btn.btn-small', { href: '/credits.html' }, t('st.credits')),
      el('a.btn.btn-small', { href: '/privacy.html' }, t('st.privacy')),
    ),
  );
  appVersion().then((m) => {
    const line = panel.querySelector('#app-version');
    if (line) line.textContent = t('st.version', { v: m ? m[1] : '' });
  });
  return panel;
}

export function dangerPanel() {
  return el('div.panel', {},
    el('h2', {}, t('st.danger')),
    el('p.lede', {}, t('st.dangerLede')),
    el('div.actions', {},
      el('button.btn', {
        onclick: async (e) => {
          if (!confirm(t('st.resetConfirm'))) return;
          try {
            state.progress = await api.resetProgress();
            applyTheme();
            location.hash = '#/';
          } catch (err) {
            e.target.closest('.panel').prepend(errorBanner(err));
          }
        },
      }, t('st.resetBtn')),
    ),
  );
}

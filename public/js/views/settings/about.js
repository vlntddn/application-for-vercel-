// Settings → Help & feedback and About (ST2).
import { el } from '../../ui.js';
import { t } from '../../i18n.js';
import { feedbackHref, FEEDBACK_EMAIL } from '../common.js';

export function helpPanel() {
  return el('div.panel', { id: 'st-help' },
    el('h2', {}, t('st.helpFeedback')),
    el('p.lede', {}, t('st.feedbackLede')),
    el('div.actions', {},
      el('a.btn.btn-primary', { id: 's-mailto', href: feedbackHref('Passo feedback') }, t('st.writeUs')),
    ),
    el('p.stat-sub', {}, FEEDBACK_EMAIL),
  );
}

/**
 * The app version is the service worker's VERSION: asked by message, so
 * reading it needs no network. Without an active worker the line keeps "—".
 */
function askVersion(line) {
  const sw = navigator.serviceWorker;
  if (!sw?.controller) return;
  const onMessage = (event) => {
    if (event.data?.type !== 'version') return;
    line.textContent = t('st.version', { v: event.data.version });
    sw.removeEventListener('message', onMessage);
  };
  sw.addEventListener('message', onMessage);
  sw.controller.postMessage('version');
}

export function aboutPanel() {
  const version = el('p.stat-sub', { id: 's-version' }, t('st.version', { v: '—' }));
  askVersion(version);
  return el('div.panel', { id: 'st-about' },
    el('h2', {}, t('st.about')),
    el('div.row', {},
      el('div', { style: 'flex:1' },
        el('strong', {}, 'PASSO'),
        version,
        el('p.stat-sub', {}, t('st.aboutStats')),
      ),
    ),
    el('div.actions', {},
      el('a.btn.btn-small', { id: 's-credits', href: '/credits.html' }, t('st.credits')),
      el('a.btn.btn-small', { id: 's-privacy', href: '/privacy.html' }, t('st.privacy')),
    ),
  );
}

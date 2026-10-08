// Settings → Offline & install (ST2): install status and the way to install
// on this browser, plus "Download for offline" with progress — one panel.
import { state } from '../../state.js';
import { el } from '../../ui.js';
import { installMode, onInstallChange, promptInstall } from '../../install.js';
import { t } from '../../i18n.js';
import { errorBanner } from '../common.js';

/**
 * Warms the service-worker cache with every study asset: topic lists,
 * theory, dictionary, all question files and every sign image. Fetches
 * go through the SW's stale-while-revalidate handler, which stores them.
 */
async function downloadForOffline(box) {
  if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) {
    box.replaceChildren(el('p.error-banner', { role: 'alert' }, t('st.offlineNotReady')));
    return;
  }
  const label = el('span.tag', { role: 'status' }, t('st.offlinePreparing'));
  box.replaceChildren(label);
  try {
    const dataUrls = [
      '/data/manifest.json', '/data/theory.json', '/data/dictionary.json', '/data/lessons.json',
      ...state.manifest.categories.map((c) => `/data/questions/${c.slug}.json`),
    ];
    const images = new Set();
    let done = 0;
    for (const url of dataUrls) {
      const res = await fetch(url);
      if (url.startsWith('/data/questions/')) {
        for (const q of await res.json()) if (q.image_url) images.add(q.image_url);
      }
      label.textContent = t('st.offlineData', { done: ++done, total: dataUrls.length });
    }
    const imageList = [...images];
    done = 0;
    // modest concurrency so the UI stays readable and the server happy
    const workers = Array.from({ length: 8 }, async () => {
      while (imageList.length) {
        const url = imageList.pop();
        await fetch(url).catch(() => {});
        done += 1;
        if (done % 20 === 0 || done === images.size) {
          label.textContent = t('st.offlineImages', { done, total: images.size });
        }
      }
    });
    await Promise.all(workers);
    box.replaceChildren(el('span.tag.ok', {}, t('st.offlineReady')));
  } catch (err) {
    box.replaceChildren(errorBanner(err));
  }
}

/** Installed or not, and what to do about it on this browser. */
function installBlock() {
  const mode = installMode();
  const status = el('p', {}, el('strong', {},
    mode === 'installed' ? t('st.installedYes') : t('st.installedNo')));
  if (mode === 'installed') return [status];
  if (mode === 'prompt') {
    return [status, el('div.actions', {},
      el('button.btn', { id: 's-install', onclick: () => promptInstall() }, t('st.installBtn')))];
  }
  return [status, el('p.lede', {}, mode === 'ios' ? t('st.installIos') : t('st.installManual'))];
}

export function offlinePanel() {
  const install = el('div', { id: 'install-status' }, ...installBlock());
  onInstallChange(() => {
    if (install.isConnected) install.replaceChildren(...installBlock());
  });
  const offlineBox = el('div.actions', { id: 'offline-actions' });
  offlineBox.append(
    el('button.btn.btn-primary', { id: 's-offline', onclick: () => downloadForOffline(offlineBox) }, t('st.offlineBtn')),
  );
  return el('div.panel', { id: 'st-offline' },
    el('h2', {}, t('st.offlineInstall')),
    install,
    el('p.lede', {}, t('st.offlineLede')),
    offlineBox,
  );
}

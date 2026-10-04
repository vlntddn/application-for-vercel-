// Settings → "Offline & install" panel (ST2): install-as-app status +
// offer and the offline download in ONE panel.
import { state } from '../../state.js';
import { el } from '../../ui.js';
import { t } from '../../i18n.js';
import { errorBanner } from '../common.js';
import { renderInstallBox } from '../../install.js';

/**
 * Warms the service-worker cache with every study asset: topic lists,
 * theory, dictionary, all question files and every sign image. Fetches
 * go through the SW's stale-while-revalidate handler, which stores them.
 */
async function downloadForOffline(button) {
  const box = button.parentElement;
  if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) {
    box.replaceChildren(el('p.error-banner', { role: 'alert' },
      t('st.offlineNotReady')));
    return;
  }
  const label = el('span.tag', {}, t('st.offlinePreparing'));
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

export function offlinePanel() {
  return el('div.panel', {},
    el('h2', {}, t('st.offline')),
    el('p.lede', {}, t('st.offlineLede')),
    el('div', { id: 'install-box' }),
    el('div.actions', { id: 'offline-actions' },
      el('button.btn.btn-primary', { onclick: (e) => downloadForOffline(e.target) }, t('st.offlineBtn')),
    ),
  );
}

/** Fills the install box (found in the DOM, so it survives re-renders). */
export function fillInstallBox(root) {
  const box = root.querySelector('#install-box');
  if (box) renderInstallBox(box);
}

/**
 * Install-as-app helpers for the hosted build.
 *
 * Android/Chromium: the browser fires beforeinstallprompt; we keep the
 * deferred event and show a real install button in Settings.
 * iOS Safari: there is no prompt API at all — only the share-sheet
 * "Add to Home Screen" flow, so we show written instructions instead.
 * Already installed (display-mode: standalone): we say so and stop.
 */
import { el } from './ui.js';
import { t } from './i18n.js';

let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (event) => {
  // preventDefault stops Chrome's own mini-infobar; we offer the install
  // deliberately from Settings.
  event.preventDefault();
  deferredPrompt = event;
});

export function isInstalled() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    navigator.standalone === true // pre-15 iOS Safari
  );
}

export function isIOSSafari() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

async function offerInstall(box) {
  const prompt = deferredPrompt;
  if (!prompt) {
    renderInstallBox(box);
    return;
  }
  prompt.prompt();
  const choice = await prompt.userChoice;
  // A declined offer cannot be re-offered in this session.
  deferredPrompt = null;
  renderInstallBox(box);
}

/**
 * Fills a container with the right install offer, WITHOUT its own panel
 * title — the surrounding settings panel supplies the heading (ST2: the
 * old standalone "INSTALL AS APP" panel is folded into "Offline & install").
 */
export function renderInstallBox(box) {
  box.replaceChildren(el('h3.label', {}, t('st.install')));
  if (isInstalled()) {
    box.append(el('p.stat-sub', {}, t('st.installedYes')));
    return;
  }
  if (isIOSSafari()) {
    box.append(el('p.stat-sub', {}, t('st.installIos')));
    return;
  }
  if (deferredPrompt) {
    box.append(el('div.actions', {},
      el('button.btn.btn-primary', { onclick: () => offerInstall(box) }, t('st.installBtn')),
    ));
    return;
  }
  box.append(el('p.stat-sub', {}, t('st.installChrome')));
}

/** Legacy whole-panel form (title + body); kept for any other callers. */
export function renderInstallPanel(panel) {
  panel.replaceChildren(el('h2', {}, t('st.install')));
  const box = el('div.panel-body', {});
  panel.append(box);
  renderInstallBox(box);
}

// If the install finishes while Settings is open, refresh the box.
window.addEventListener('appinstalled', () => {
  const box = document.getElementById('install-box');
  if (box) renderInstallBox(box);
});

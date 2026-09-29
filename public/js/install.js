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

async function offerInstall(panel) {
  const prompt = deferredPrompt;
  if (!prompt) {
    renderInstallPanel(panel);
    return;
  }
  prompt.prompt();
  const choice = await prompt.userChoice;
  // A declined offer cannot be re-offered in this session.
  deferredPrompt = null;
  renderInstallPanel(panel);
}

/** Fills the Settings "INSTALL AS APP" panel body with the right offer. */
export function renderInstallPanel(panel) {
  panel.replaceChildren(el('h2', {}, 'INSTALL AS APP'));
  const box = el('div.panel-body', {});
  panel.append(box);
  const target = box;

  if (isInstalled()) {
    target.append(
      el('p.lede', {}, 'Installed. It opens as a full app, works offline, and your progress lives only on this device.'),
    );
    return;
  }
  if (isIOSSafari()) {
    target.append(
      el('p.lede', {}, 'In Safari: tap the Share button, then Add to Home Screen. The app opens without the browser bar, and installing it keeps your progress safe from browser cleanup.'),
    );
    return;
  }
  if (deferredPrompt) {
    target.append(
      el('div.actions', {},
        el('button.btn.btn-primary', {
          onclick: () => offerInstall(panel),
        }, 'INSTALL APP'),
      ),
    );
    return;
  }
  target.append(
    el('p.lede', {}, 'In Chrome or Android: menu (three dots) then Install App, or Add to Home Screen.'),
  );
}

// If the install finishes while Settings is open, refresh the panel.
window.addEventListener('appinstalled', () => {
  const panel = document.getElementById('install-panel');
  if (panel) renderInstallPanel(panel);
});

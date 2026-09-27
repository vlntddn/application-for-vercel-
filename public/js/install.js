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
      el('p.lede', {}, 'INSTALLED. IT OPENS AS A FULL APP, WORKS OFFLINE, AND YOUR PROGRESS LIVES ONLY ON THIS DEVICE.'),
    );
    return;
  }
  if (isIOSSafari()) {
    target.append(
      el('p.lede', {}, 'IN SAFARI: TAP THE SHARE BUTTON, THEN ADD TO HOME SCREEN. THE APP OPENS WITHOUT THE BROWSER BAR, AND INSTALLING IT KEEPS YOUR PROGRESS SAFE FROM BROWSER CLEANUP.'),
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
    el('p.lede', {}, 'IN CHROME OR ANDROID: MENU (THREE DOTS) THEN INSTALL APP, OR ADD TO HOME SCREEN.'),
  );
}

// If the install finishes while Settings is open, refresh the panel.
window.addEventListener('appinstalled', () => {
  const panel = document.getElementById('install-panel');
  if (panel) renderInstallPanel(panel);
});

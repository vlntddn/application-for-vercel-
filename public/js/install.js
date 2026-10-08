/**
 * Install-as-app helpers for the hosted build.
 *
 * Android/Chromium: the browser fires beforeinstallprompt; we keep the
 * deferred event and show a real install button in Settings.
 * iOS Safari: there is no prompt API at all — only the share-sheet
 * "Add to Home Screen" flow, so we show written instructions instead.
 * Already installed (display-mode: standalone): we say so and stop.
 */

let deferredPrompt = null;
let onChange = null;
window.addEventListener('beforeinstallprompt', (event) => {
  // preventDefault stops Chrome's own mini-infobar; we offer the install
  // deliberately from Settings.
  event.preventDefault();
  deferredPrompt = event;
  onChange?.();
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

/**
 * Which install path this browser offers (ST2, Settings → Offline & install):
 * 'installed' | 'ios' (Share → Add to Home Screen) | 'prompt' (a real
 * install button) | 'manual' (browser menu instructions).
 */
export function installMode() {
  if (isInstalled()) return 'installed';
  if (isIOSSafari()) return 'ios';
  if (deferredPrompt) return 'prompt';
  return 'manual';
}

/** Settings registers one callback to redraw when the install state changes. */
export function onInstallChange(callback) {
  onChange = callback;
}

/** Shows the browser's install dialog (only in 'prompt' mode). */
export async function promptInstall() {
  const prompt = deferredPrompt;
  if (prompt) {
    prompt.prompt();
    await prompt.userChoice;
    // A declined offer cannot be re-offered in this session.
    deferredPrompt = null;
  }
  onChange?.();
}

// If the install finishes while Settings is open, redraw its status.
window.addEventListener('appinstalled', () => onChange?.());

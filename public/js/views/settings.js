// Settings screen, extracted from views.js (Sprint 1, S1.3) — pure code move, no behavior change.
import { api } from '../api.js';
import { state, applyTheme } from '../state.js';
import { el, clear } from '../ui.js';
import { requestPersistentStorage } from '../local-progress.js';
import { renderInstallPanel } from '../install.js';
import { DAILY_GOAL_DEFAULT, SIGNAL_HINT_MODES } from '../domain/progress.js';
import { t } from '../i18n.js';
import { errorBanner, readLastBackup, exportProgressSnapshot, feedbackHref, FEEDBACK_EMAIL } from './common.js';

// Options of the daily-goal selector (lost in the S1.3 move — restored).
const DAILY_GOAL_CHOICES = [5, 10, 15, 20, 25, 30, 40, 50, 75, 100];

/* ============================== SETTINGS ============================== */

/**
 * Tells the user, in plain terms, whether this browser has promised to
 * keep their progress. iOS clears storage for sites that were never added
 * to the Home Screen after about a week of no visits, so this is worth
 * saying out loud rather than hiding behind a green tick.
 * (S2.8a: sentence case, icon + word instead of a colored tag.)
 */
async function showStorageStatus(root) {
  const line = root.querySelector('#storage-status');
  if (!line) return;
  const word = line.querySelector('#storage-status-word');
  const { supported, persisted } = await requestPersistentStorage();
  if (persisted) {
    word.textContent = t('st.storageProtected');
  } else if (supported) {
    word.textContent = t('st.storageNotProtected');
  } else {
    word.textContent = t('st.storageSavedBrowser');
  }
}

/** Downloads the backup (shared snapshot, common.js) and updates the label. */
function exportProgress(button) {
  const exportedAt = exportProgressSnapshot();
  const line = button.closest('.panel').querySelector('#last-backup');
  if (line) line.textContent = t('st.lastBackup', { date: new Date(exportedAt).toLocaleDateString() });
}

/** Replaces all progress with a backup file, after confirmation. */
async function importProgressFile(picker, root, box) {
  const file = picker.files?.[0];
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    const answers = Object.keys(parsed.answers || {}).length;
    if (!confirm(t('st.importConfirm', { answers }))) {
      return;
    }
    state.progress = await api.importProgress(parsed);
    applyTheme();
    box?.replaceChildren(el('span.tag.ok', {}, t('st.imported', { answers })));
    setTimeout(() => renderSettings(root), 1500);
  } catch (err) {
    box?.replaceChildren(errorBanner(
      err instanceof SyntaxError ? new Error(t('st.invalidBackup')) : err,
    ));
  }
}

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

/** Small shield glyph next to the storage status (icon + word, no color). */
function shieldIcon() {
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'ic');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(svgNS, 'path');
  path.setAttribute('d', 'M12 3l8 3v6c0 4.5-3.2 7.7-8 9-4.8-1.3-8-4.5-8-9V6z');
  svg.append(path);
  return svg;
}

export function renderSettings(root) {
  const { profile } = state.progress;
  const nameInput = el('input', { id: 's-name', type: 'text', maxLength: 40, value: profile.name });
  const langSelect = el('select', { id: 's-lang' },
    el('option', { value: 'en', textContent: 'ENGLISH' }),
    el('option', { value: 'ru', textContent: 'РУССКИЙ' }),
    el('option', { value: 'zh', textContent: '中文' }),
  );
  langSelect.value = profile.language;
  const themeSelect = el('select', { id: 's-theme' },
    el('option', { value: 'light', textContent: t('st.themeLight') }),
    el('option', { value: 'dark', textContent: t('st.themeDark') }),
    el('option', { value: 'auto', textContent: t('st.themeAuto') }),
  );
  themeSelect.value = profile.theme;
  const soundSelect = el('select', { id: 's-sound' },
    el('option', { value: 'on', textContent: t('st.soundOn') }),
    el('option', { value: 'off', textContent: t('st.soundOff') }),
  );
  soundSelect.value = profile.sound === false ? 'off' : 'on';
  // L2 — signal-word hints in practice questions: auto (default; off after
  // 100 answers), on (always), off (never). Invalid stored value → 'auto'.
  const signalSelect = el('select', { id: 's-signal-hints' },
    el('option', { value: 'auto', textContent: t('st.hintsAuto') }),
    el('option', { value: 'on', textContent: t('st.hintsOn') }),
    el('option', { value: 'off', textContent: t('st.hintsOff') }),
  );
  signalSelect.value = SIGNAL_HINT_MODES.includes(profile.signalHints) ? profile.signalHints : 'auto';
  const storedGoal = Number.isInteger(profile.dailyGoal) ? profile.dailyGoal : DAILY_GOAL_DEFAULT;
  // A value outside the presets (set on an older build) still shows up.
  const goalOptions = DAILY_GOAL_CHOICES.includes(storedGoal)
    ? DAILY_GOAL_CHOICES
    : [...DAILY_GOAL_CHOICES, storedGoal].sort((a, b) => a - b);
  const goalSelect = el('select', { id: 's-goal' },
    ...goalOptions.map((n) => el('option', { value: String(n), textContent: t('st.goalQuestions', { n }) })),
  );
  goalSelect.value = String(storedGoal);

  // S2.8a: the user must see where progress lives and how to keep a copy
  // before anything else. Facts, not marketing (roadmap S2.8a).
  const lastBackup = readLastBackup();
  const importBox = el('div.actions', { id: 'backup-actions' });
  const progressPanel = el('div.panel', {},
    el('h2', {}, t('st.yourProgress')),
    el('p.lede', {}, t('st.progressLede')),
    el('div.row', { id: 'storage-status' },
      shieldIcon(),
      el('div', { style: 'flex:1' },
        el('strong', {}, el('span', { id: 'storage-status-word' }, t('st.checking'))),
        el('p.stat-sub', { id: 'last-backup' }, t('st.lastBackup', { date: lastBackup ? new Date(lastBackup).toLocaleDateString() : t('st.lastBackupNever') })),
      ),
    ),
    el('dl.progress-erases', {},
      el('dt', {}, t('st.erasesTitle')),
      el('dd', {}, t('st.erasesClear')),
      el('dd', {}, t('st.erasesPrivate')),
      el('dd', {}, t('st.erasesSafari')),
      el('dd', {}, t('st.erasesOther')),
    ),
    el('div.actions', { id: 'progress-actions' },
      el('button.btn.btn-primary', { onclick: (e) => exportProgress(e.target) }, t('st.exportBackup')),
      el('button.btn', {
        onclick: (e) => {
          const picker = el('input', {
            type: 'file', accept: 'application/json,.json',
            onchange: () => importProgressFile(picker, root, importBox),
          });
          picker.click();
        },
      }, t('st.importBackup')),
    ),
    importBox,
  );
  const profilePanel = el('div.panel', {},
    el('h2', {}, t('st.profile')),
    el('div.field', {}, el('label', { htmlFor: 's-name' }, t('st.yourName')), nameInput),
    el('div.field', {}, el('label', { htmlFor: 's-lang' }, t('st.langLabel')), langSelect),
    el('div.field', {}, el('label', { htmlFor: 's-theme' }, t('st.themeLabel')), themeSelect),
    el('div.field', {}, el('label', { htmlFor: 's-sound' }, t('st.soundLabel')), soundSelect),
    el('div.field', {}, el('label', { htmlFor: 's-signal-hints' }, t('st.hintsLabel')), signalSelect),
    el('div.field', {}, el('label', { htmlFor: 's-goal' }, t('st.goalLabel')), goalSelect),
    el('div.actions', {},
      el('button.btn.btn-primary', {
        onclick: async (e) => {
          try {
            const { profile: updated } = await api.updateProfile({
              name: nameInput.value,
              language: langSelect.value,
              theme: themeSelect.value,
              sound: soundSelect.value === 'on',
              signalHints: signalSelect.value,
              dailyGoal: Number(goalSelect.value),
            });
            state.progress.profile = updated;
            applyTheme();
            renderSettings(root);
          } catch (err) {
            e.target.closest('.panel').prepend(errorBanner(err));
          }
        },
      }, t('st.save')),
    ),
  );
  clear(root,
    el('h1', {}, t('st.title')),
    profilePanel,
    progressPanel,
    el('div.panel', {},
      el('h2', {}, t('st.backup')),
      el('p.lede', {}, t('st.backupLede')),
    ),
    el('div.panel', { id: 'install-panel' }),
    el('div.panel', {},
      el('h2', {}, t('st.offline')),
      el('p.lede', {}, t('st.offlineLede')),
      el('div.actions', { id: 'offline-actions' },
        el('button.btn.btn-primary', { onclick: (e) => downloadForOffline(e.target) }, t('st.offlineBtn')),
      ),
    ),
    el('div.panel', {},
      el('h2', {}, t('st.feedback')),
      el('p.lede', {}, t('st.feedbackLede')),
      el('div.actions', {},
        el('a.btn.btn-primary', { href: feedbackHref('Passo feedback') }, t('st.writeUs')),
      ),
      el('p.stat-sub', {}, FEEDBACK_EMAIL),
    ),
    el('div.panel', {},
      el('h2', {}, t('st.about')),
      el('div.row', {},
        el('div', { style: 'flex:1' },
          el('strong', {}, 'PASSO'),
          el('p.stat-sub', {}, t('st.aboutStats')),
        ),
      ),
      el('div.actions', {},
        el('a.btn.btn-small', { href: '/credits.html' }, t('st.credits')),
        el('a.btn.btn-small', { href: '/privacy.html' }, t('st.privacy')),
      ),
    ),
    el('div.panel', {},
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
    ),
  );

  renderInstallPanel(root.querySelector('#install-panel'));
  showStorageStatus(root);
}

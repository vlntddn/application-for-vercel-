// Settings screen, extracted from views.js (Sprint 1, S1.3) — pure code move, no behavior change.
import { api } from '../api.js';
import { state, applyTheme } from '../state.js';
import { el, clear } from '../ui.js';
import { requestPersistentStorage } from '../local-progress.js';
import { renderInstallPanel } from '../install.js';
import { DAILY_GOAL_DEFAULT } from '../domain/progress.js';
import { errorBanner, readLastBackup, exportProgressSnapshot } from './common.js';

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
    word.textContent = 'Protected';
  } else if (supported) {
    word.textContent = 'Not protected yet — add the app to your Home Screen';
  } else {
    word.textContent = 'Saved in this browser';
  }
}

/** Downloads the backup (shared snapshot, common.js) and updates the label. */
function exportProgress(button) {
  const exportedAt = exportProgressSnapshot();
  const line = button.closest('.panel').querySelector('#last-backup');
  if (line) line.textContent = `Last backup: ${new Date(exportedAt).toLocaleDateString()}`;
}

/** Replaces all progress with a backup file, after confirmation. */
async function importProgressFile(picker, root, box) {
  const file = picker.files?.[0];
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    const answers = Object.keys(parsed.answers || {}).length;
    if (!confirm(`Replace ALL current progress with this backup (${answers} answered questions)? This cannot be undone.`)) {
      return;
    }
    state.progress = await api.importProgress(parsed);
    applyTheme();
    box?.replaceChildren(el('span.tag.ok', {}, `IMPORTED — ${answers} ANSWERS RESTORED`));
    setTimeout(() => renderSettings(root), 1500);
  } catch (err) {
    box?.replaceChildren(errorBanner(
      err instanceof SyntaxError ? new Error('That file is not a valid backup') : err,
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
      'OFFLINE CACHE NOT READY — RELOAD THE PAGE ONCE AND TRY AGAIN.'));
    return;
  }
  const label = el('span.tag', {}, 'PREPARING...');
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
      label.textContent = `DATA ${++done}/${dataUrls.length}`;
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
          label.textContent = `IMAGES ${done}/${images.size}`;
        }
      }
    });
    await Promise.all(workers);
    box.replaceChildren(el('span.tag.ok', {}, 'READY FOR OFFLINE USE'));
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
    el('option', { value: 'light', textContent: 'LIGHT' }),
    el('option', { value: 'dark', textContent: 'DARK' }),
  );
  themeSelect.value = profile.theme;
  const soundSelect = el('select', { id: 's-sound' },
    el('option', { value: 'on', textContent: 'ON' }),
    el('option', { value: 'off', textContent: 'OFF' }),
  );
  soundSelect.value = profile.sound === false ? 'off' : 'on';
  const storedGoal = Number.isInteger(profile.dailyGoal) ? profile.dailyGoal : DAILY_GOAL_DEFAULT;
  // A value outside the presets (set on an older build) still shows up.
  const goalOptions = DAILY_GOAL_CHOICES.includes(storedGoal)
    ? DAILY_GOAL_CHOICES
    : [...DAILY_GOAL_CHOICES, storedGoal].sort((a, b) => a - b);
  const goalSelect = el('select', { id: 's-goal' },
    ...goalOptions.map((n) => el('option', { value: String(n), textContent: `${n} QUESTIONS` })),
  );
  goalSelect.value = String(storedGoal);

  // S2.8a: the user must see where progress lives and how to keep a copy
  // before anything else. Facts, not marketing (roadmap S2.8a).
  const lastBackup = readLastBackup();
  const importBox = el('div.actions', { id: 'backup-actions' });
  const progressPanel = el('div.panel', {},
    el('h2', {}, 'YOUR PROGRESS'),
    el('p.lede', {}, 'Your progress stays on this device. A website update never erases it — only these do.'),
    el('div.row', { id: 'storage-status' },
      shieldIcon(),
      el('div', { style: 'flex:1' },
        el('strong', {}, el('span', { id: 'storage-status-word' }, 'Checking…')),
        el('p.stat-sub', { id: 'last-backup' }, `Last backup: ${lastBackup ? new Date(lastBackup).toLocaleDateString() : 'never'}`),
      ),
    ),
    el('dl.progress-erases', {},
      el('dt', {}, 'What erases it'),
      el('dd', {}, 'Clearing this site’s data or browser history'),
      el('dd', {}, 'Private or incognito mode — when the window closes'),
      el('dd', {}, 'Safari on iPhone/iPad, after ~7 days without a visit, if the app is not on your Home Screen'),
      el('dd', {}, 'It is not in any other browser or device — move it with a backup file'),
    ),
    el('div.actions', { id: 'progress-actions' },
      el('button.btn.btn-primary', { onclick: (e) => exportProgress(e.target) }, 'Export backup'),
      el('button.btn', {
        onclick: (e) => {
          const picker = el('input', {
            type: 'file', accept: 'application/json,.json',
            onchange: () => importProgressFile(picker, root, importBox),
          });
          picker.click();
        },
      }, 'Import backup'),
    ),
    importBox,
  );
  const profilePanel = el('div.panel', {},
    el('h2', {}, 'PROFILE'),
    el('div.field', {}, el('label', { htmlFor: 's-name' }, 'YOUR NAME'), nameInput),
    el('div.field', {}, el('label', { htmlFor: 's-lang' }, 'TRANSLATION LANGUAGE'), langSelect),
    el('div.field', {}, el('label', { htmlFor: 's-theme' }, 'THEME'), themeSelect),
    el('div.field', {}, el('label', { htmlFor: 's-sound' }, 'ANSWER SOUNDS'), soundSelect),
    el('div.field', {}, el('label', { htmlFor: 's-goal' }, 'DAILY GOAL'), goalSelect),
    el('div.actions', {},
      el('button.btn.btn-primary', {
        onclick: async (e) => {
          try {
            const { profile: updated } = await api.updateProfile({
              name: nameInput.value,
              language: langSelect.value,
              theme: themeSelect.value,
              sound: soundSelect.value === 'on',
              dailyGoal: Number(goalSelect.value),
            });
            state.progress.profile = updated;
            applyTheme();
            renderSettings(root);
          } catch (err) {
            e.target.closest('.panel').prepend(errorBanner(err));
          }
        },
      }, 'SAVE'),
    ),
  );
  clear(root,
    el('h1', {}, 'SETTINGS'),
    profilePanel,
    progressPanel,
    el('div.panel', {},
      el('h2', {}, 'BACKUP'),
      el('p.lede', {}, 'Export and import your backup in the "Your progress" block above — it also tells you what erases your progress and when the last backup was.'),
    ),
    el('div.panel', { id: 'install-panel' }),
    el('div.panel', {},
      el('h2', {}, 'OFFLINE MODE'),
      el('p.lede', {}, 'DOWNLOAD THE WHOLE QUESTION BANK, THEORY AND SIGN IMAGES (~8 MB) TO STUDY WITHOUT INTERNET.'),
      el('div.actions', { id: 'offline-actions' },
        el('button.btn.btn-primary', { onclick: (e) => downloadForOffline(e.target) }, 'DOWNLOAD FOR OFFLINE'),
      ),
    ),
    el('div.panel', {},
      el('h2', {}, 'ABOUT'),
      el('div.row', {},
        el('div', { style: 'flex:1' },
          el('strong', {}, 'PASSO'),
          el('p.stat-sub', {}, '7139 QUESTIONS · 25 LESSONS · NOT AN OFFICIAL APP'),
        ),
      ),
      el('div.actions', {},
        el('a.btn.btn-small', { href: '/credits.html' }, 'CREDITS & LICENCES'),
        el('a.btn.btn-small', { href: '/privacy.html' }, 'PRIVACY'),
      ),
    ),
    el('div.panel', {},
      el('h2', {}, 'DANGER ZONE'),
      el('p.lede', {}, 'RESET WIPES ALL ANSWERS, MISTAKES, EXAMS AND STREAK. THERE IS NO UNDO.'),
      el('div.actions', {},
        el('button.btn', {
          onclick: async (e) => {
            if (!confirm('Reset ALL progress? This cannot be undone.')) return;
            try {
              state.progress = await api.resetProgress();
              applyTheme();
              location.hash = '#/';
            } catch (err) {
              e.target.closest('.panel').prepend(errorBanner(err));
            }
          },
        }, 'RESET ALL PROGRESS'),
      ),
    ),
  );

  renderInstallPanel(root.querySelector('#install-panel'));
  showStorageStatus(root);
}

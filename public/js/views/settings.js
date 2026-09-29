// Settings screen, extracted from views.js (Sprint 1, S1.3) — pure code move, no behavior change.
import { api } from '../api.js';
import { state, applyTheme } from '../state.js';
import { el, clear } from '../ui.js';
import { requestPersistentStorage } from '../local-progress.js';
import { renderInstallPanel } from '../install.js';
import { DAILY_GOAL_DEFAULT } from '../domain/progress.js';
import { errorBanner } from './common.js';

// Options of the daily-goal selector (lost in the S1.3 move — restored).
const DAILY_GOAL_CHOICES = [5, 10, 15, 20, 25, 30, 40, 50, 75, 100];

/* ============================== SETTINGS ============================== */

/**
 * Tells the user, in plain terms, whether this browser has promised to
 * keep their progress. iOS clears storage for sites that were never added
 * to the Home Screen after about a week of no visits, so this is worth
 * saying out loud rather than hiding behind a green tick.
 */
async function showStorageStatus(root) {
  const note = root.querySelector('#storage-note');
  if (!note) return;
  const { supported, persisted } = await requestPersistentStorage();
  if (persisted) {
    note.textContent = 'PROTECTED — THIS BROWSER WILL KEEP YOUR PROGRESS. EXPORT A BACKUP BEFORE CHANGING DEVICE.';
  } else if (supported) {
    note.textContent =
      'NOT PROTECTED YET — ADD THE APP TO YOUR HOME SCREEN, OR THE BROWSER MAY CLEAR IT AFTER A WEEK UNUSED. EXPORT A BACKUP TO BE SAFE.';
  } else {
    note.textContent = 'PROGRESS IS SAVED IN THIS BROWSER. EXPORT A BACKUP TO KEEP A COPY.';
  }
}

/** Downloads the whole progress snapshot as a dated JSON backup. */
function exportProgress(button) {
  const backup = {
    app: 'patente-pro',
    exportedAt: new Date().toISOString(),
    ...state.progress,
  };
  delete backup.stats; // derived on the server, not part of the data
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }),
  );
  const link = el('a', {
    href: url,
    download: `patente-pro-backup-${new Date().toISOString().slice(0, 10)}.json`,
  });
  link.click();
  URL.revokeObjectURL(url);
  const done = el('span.tag.ok', {}, 'BACKUP SAVED');
  button.replaceWith(done);
  setTimeout(() => done.replaceWith(button), 2500);
}

/** Replaces all progress with a backup file, after confirmation. */
async function importProgressFile(picker, root) {
  const file = picker.files?.[0];
  if (!file) return;
  const box = document.getElementById('backup-actions');
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

  clear(root,
    el('h1', {}, 'SETTINGS'),
    el('div.panel', {},
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
    ),
    el('div.panel', {},
      el('h2', {}, 'BACKUP'),
      el('p.lede', {}, 'YOUR PROGRESS LIVES ON THIS MACHINE ONLY. KEEP A COPY, OR MOVE IT TO ANOTHER COMPUTER.'),
      el('div.row', {},
        el('div', { style: 'flex:1' },
          el('strong', {}, 'STORAGE ON THIS DEVICE'),
          el('p.stat-sub', { id: 'storage-note' }, 'CHECKING…'),
        ),
      ),
      el('div.actions', { id: 'backup-actions' },
        el('button.btn', { onclick: (e) => exportProgress(e.target) }, 'EXPORT TO FILE'),
        el('button.btn', {
          onclick: (e) => {
            const picker = el('input', {
              type: 'file', accept: 'application/json,.json',
              onchange: () => importProgressFile(picker, root),
            });
            picker.click();
          },
        }, 'IMPORT FROM FILE'),
      ),
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

// Settings → "Your progress" panel (ST2): storage status, what erases
// progress, Export/Import and the last-backup line. The old "BACKUP"
// panel (heading + paragraph, no actions) is gone — everything lives here.
import { api } from '../../api.js';
import { state, applyTheme } from '../../state.js';
import { el } from '../../ui.js';
import { requestPersistentStorage } from '../../local-progress.js';
import { t } from '../../i18n.js';
import { errorBanner, readLastBackup, exportProgressSnapshot } from '../common.js';

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

/** Downloads the backup (shared snapshot, common.js) and updates the label. */
function exportProgress(button) {
  const exportedAt = exportProgressSnapshot();
  const line = button.closest('.panel').querySelector('#last-backup');
  if (line) line.textContent = t('st.lastBackup', { date: new Date(exportedAt).toLocaleDateString() });
}

/** Replaces all progress with a backup file, after confirmation. */
async function importProgressFile(picker, box, rerender) {
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
    box.replaceChildren(el('span.tag.ok', {}, t('st.imported', { answers })));
    setTimeout(rerender, 1500);
  } catch (err) {
    box.replaceChildren(errorBanner(
      err instanceof SyntaxError ? new Error(t('st.invalidBackup')) : err,
    ));
  }
}

export function progressPanel(rerender) {
  const lastBackup = readLastBackup();
  const importBox = el('div.actions', { id: 'backup-actions' });
  // S2.8a: the user must see where progress lives and how to keep a copy
  // before anything else. Facts, not marketing (roadmap S2.8a).
  return el('div.panel', {},
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
            onchange: () => importProgressFile(picker, importBox, rerender),
          });
          picker.click();
        },
      }, t('st.importBackup')),
    ),
    importBox,
  );
}

export function initProgressPanel(root) {
  showStorageStatus(root);
}

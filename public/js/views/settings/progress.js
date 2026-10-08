// Settings → Your progress (ST2): where progress lives, what erases it,
// export/import and the last backup date — one panel (the old separate
// "Backup" panel only repeated this and is gone).
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
 */
export async function showStorageStatus(root) {
  const word = root.querySelector('#storage-status-word');
  if (!word) return;
  const { supported, persisted } = await requestPersistentStorage();
  if (persisted) word.textContent = t('st.storageProtected');
  else if (supported) word.textContent = t('st.storageNotProtected');
  else word.textContent = t('st.storageSavedBrowser');
}

/** Downloads the backup (shared snapshot, common.js) and updates the label. */
function exportProgress(root) {
  const exportedAt = exportProgressSnapshot();
  root.querySelector('#last-backup').textContent =
    t('st.lastBackup', { date: new Date(exportedAt).toLocaleDateString() });
}

/** Replaces all progress with a backup file, after confirmation. */
async function importProgressFile(file, box, rerender) {
  try {
    const parsed = JSON.parse(await file.text());
    const answers = Object.keys(parsed.answers || {}).length;
    if (!confirm(t('st.importConfirm', { answers }))) return;
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

/** Small shield glyph next to the storage status (icon + word, no color). */
function shieldIcon() {
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  for (const [k, v] of Object.entries({
    viewBox: '0 0 24 24', class: 'ic', fill: 'none', stroke: 'currentColor', 'stroke-width': '2',
    'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true',
  })) svg.setAttribute(k, v);
  const path = document.createElementNS(svgNS, 'path');
  path.setAttribute('d', 'M12 3l8 3v6c0 4.5-3.2 7.7-8 9-4.8-1.3-8-4.5-8-9V6z');
  svg.append(path);
  return svg;
}

export function progressPanel(root, rerender) {
  const lastBackup = readLastBackup();
  const importBox = el('div.actions', { id: 'backup-actions' });
  // A real <input type=file> in the DOM, so tests (and assistive tech) can reach it.
  const picker = el('input', {
    id: 's-import-file', type: 'file', accept: 'application/json,.json', hidden: true,
    onchange: () => {
      const file = picker.files?.[0];
      if (file) importProgressFile(file, importBox, () => rerender(root));
      picker.value = '';
    },
  });
  return el('div.panel', { id: 'st-progress' },
    el('h2', {}, t('st.yourProgress')),
    el('p.lede', {}, t('st.progressLede')),
    el('div.row', { id: 'storage-status' },
      shieldIcon(),
      el('div', { style: 'flex:1' },
        el('strong', {}, el('span', { id: 'storage-status-word' }, t('st.checking'))),
        el('p.stat-sub', { id: 'last-backup' }, t('st.lastBackup', {
          date: lastBackup ? new Date(lastBackup).toLocaleDateString() : t('st.lastBackupNever'),
        })),
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
      el('button.btn.btn-primary', { id: 's-export', onclick: () => exportProgress(root) }, t('st.exportBackup')),
      el('button.btn', { id: 's-import', onclick: () => picker.click() }, t('st.importBackup')),
      picker,
    ),
    importBox,
  );
}

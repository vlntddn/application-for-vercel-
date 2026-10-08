// Settings screen (ST2): six panels in a fixed order — Learning, Your
// progress, Offline & install, Help & feedback, About, Danger zone. Each
// panel lives in its own module; this file only composes them.
import { api } from '../../api.js';
import { state, applyTheme } from '../../state.js';
import { el, clear } from '../../ui.js';
import { t } from '../../i18n.js';
import { errorBanner } from '../common.js';
import { learningPanel } from './learning.js';
import { progressPanel, showStorageStatus } from './progress.js';
import { offlinePanel } from './offline.js';
import { helpPanel, aboutPanel } from './about.js';

function dangerPanel() {
  return el('div.panel', { id: 'st-danger' },
    el('h2', {}, t('st.danger')),
    el('p.lede', {}, t('st.dangerLede')),
    el('div.actions', {},
      el('button.btn', {
        id: 's-reset',
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
  );
}

export function renderSettings(root) {
  clear(root,
    el('h1', {}, t('st.title')),
    learningPanel(root, renderSettings),
    progressPanel(root, renderSettings),
    offlinePanel(),
    helpPanel(),
    aboutPanel(),
    dangerPanel(),
  );
  showStorageStatus(root);
}

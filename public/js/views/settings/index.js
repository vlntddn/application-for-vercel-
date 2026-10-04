// Settings screen (ST2): a single-column layout of four panels —
// Learning, Your progress, Offline & install, About (+ Danger zone).
// The old "PROFILE" panel is merged into Learning and autosaves; the
// standalone "BACKUP" panel is removed (its facts live in "Your
// progress"). Each panel is a separate module, under ~200 lines.
import { el, clear } from '../../ui.js';
import { t } from '../../i18n.js';
import { learningPanel } from './learning.js';
import { progressPanel, initProgressPanel } from './progress.js';
import { offlinePanel, fillInstallBox } from './offline.js';
import { helpPanel, aboutPanel, dangerPanel } from './about.js';

/** Re-renders the screen in place (used after an import completes). */
function rerender(root) {
  clear(root,
    learningPanel(),
    progressPanel(() => rerender(root)),
    offlinePanel(),
    helpPanel(),
    aboutPanel(),
    dangerPanel(),
  );
  initProgressPanel(root);
  fillInstallBox(root);
}

/** Mounts the settings panels directly into `root` (= #view), like the other views. */
export function renderSettings(root) {
  clear(root,
    el('h1', {}, t('st.title')),
    el('p.lede', {}, t('st.lede')),
    learningPanel(),
    progressPanel(() => rerender(root)),
    offlinePanel(),
    helpPanel(),
    aboutPanel(),
    dangerPanel(),
  );
  initProgressPanel(root);
  fillInstallBox(root);
}

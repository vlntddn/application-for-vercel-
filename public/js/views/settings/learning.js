// Settings → Learning (ST2): name, language, daily goal, signal hints, sound
// and theme in one panel. Every field saves itself the moment it changes.
import { api } from '../../api.js';
import { state, applyTheme } from '../../state.js';
import { el } from '../../ui.js';
import { DAILY_GOAL_DEFAULT, SIGNAL_HINT_MODES } from '../../domain/progress.js';
import { t, setLang } from '../../i18n.js';
import { errorBanner } from '../common.js';

// Options of the daily-goal selector.
export const DAILY_GOAL_CHOICES = [5, 10, 15, 20, 25, 30, 40, 50, 75, 100];

function select(id, options, value) {
  const node = el('select', { id },
    ...options.map(([v, label]) => el('option', { value: v, textContent: label })),
  );
  node.value = value;
  return node;
}

function field(id, label, control) {
  return el('div.field', {}, el('label', { htmlFor: id }, label), control);
}

/** "Saved ✓" line shared by every field of the panel (role=status). */
function savedLine() {
  return el('p.stat-sub', { id: 'st-saved', role: 'status' });
}

/**
 * Saves one profile field. A language change redraws the screen in the new
 * language (via `rerender`); anything else only updates the status line.
 */
async function save(patch, root, rerender) {
  const status = root.querySelector('#st-saved');
  status.replaceChildren();
  try {
    const { profile } = await api.updateProfile(patch);
    state.progress.profile = profile;
    applyTheme();
    if ('language' in patch) {
      setLang(profile.language);
      rerender(root);
    }
    root.querySelector('#st-saved').textContent = t('st.saved');
  } catch (err) {
    status.replaceChildren(errorBanner(err));
  }
}

export function learningPanel(root, rerender) {
  const { profile } = state.progress;
  const onChange = (patchOf) => (e) => save(patchOf(e.target.value), root, rerender);

  const name = el('input', {
    id: 's-name', type: 'text', maxLength: 40, value: profile.name,
    onchange: onChange((v) => ({ name: v })),
  });
  const language = select('s-lang', [['en', 'ENGLISH'], ['ru', 'РУССКИЙ'], ['zh', '中文']], profile.language);
  language.addEventListener('change', onChange((v) => ({ language: v })));

  const storedGoal = Number.isInteger(profile.dailyGoal) ? profile.dailyGoal : DAILY_GOAL_DEFAULT;
  // A value outside the presets (set on an older build) still shows up.
  const goals = DAILY_GOAL_CHOICES.includes(storedGoal)
    ? DAILY_GOAL_CHOICES
    : [...DAILY_GOAL_CHOICES, storedGoal].sort((a, b) => a - b);
  const goal = select('s-goal', goals.map((n) => [String(n), t('st.goalQuestions', { n })]), String(storedGoal));
  goal.addEventListener('change', onChange((v) => ({ dailyGoal: Number(v) })));

  // L2 — auto (default; off after 100 answers), on, off. Invalid stored value → 'auto'.
  const hints = select('s-signal-hints', [
    ['auto', t('st.hintsAuto')], ['on', t('st.hintsOn')], ['off', t('st.hintsOff')],
  ], SIGNAL_HINT_MODES.includes(profile.signalHints) ? profile.signalHints : 'auto');
  hints.addEventListener('change', onChange((v) => ({ signalHints: v })));

  const sound = select('s-sound', [['on', t('st.soundOn')], ['off', t('st.soundOff')]],
    profile.sound === false ? 'off' : 'on');
  sound.addEventListener('change', onChange((v) => ({ sound: v === 'on' })));

  const theme = select('s-theme', [
    ['light', t('st.themeLight')], ['dark', t('st.themeDark')], ['auto', t('st.themeAuto')],
  ], profile.theme);
  theme.addEventListener('change', onChange((v) => ({ theme: v })));

  return el('div.panel', { id: 'st-learning' },
    el('h2', {}, t('st.learning')),
    field('s-name', t('st.yourName'), name),
    field('s-lang', t('st.langLabel'), language),
    field('s-goal', t('st.goalLabel'), goal),
    field('s-signal-hints', t('st.hintsLabel'), hints),
    field('s-sound', t('st.soundLabel'), sound),
    field('s-theme', t('st.themeLabel'), theme),
    savedLine(),
  );
}

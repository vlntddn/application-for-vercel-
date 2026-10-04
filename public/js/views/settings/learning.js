// Settings → "Learning" panel (ST2): name, translation language, theme,
// sounds, signal hints and daily goal in ONE panel, autosaved on every
// change — no SAVE button, a brief "Saved ✓" (role="status") instead.
import { api } from '../../api.js';
import { state, applyTheme } from '../../state.js';
import { setLang, t } from '../../i18n.js';
import { el } from '../../ui.js';
import { errorBanner } from '../common.js';
import { DAILY_GOAL_DEFAULT, SIGNAL_HINT_MODES } from '../../domain/progress.js';

// Options of the daily-goal selector (lost in the S1.3 move — restored).
const DAILY_GOAL_CHOICES = [5, 10, 15, 20, 25, 30, 40, 50, 75, 100];

/** Brief "Saved ✓" that fades out; role="status" announces it to screen readers. */
function makeSavedStatus() {
  const note = el('span', { role: 'status', style: 'opacity:0;transition:opacity .2s' });
  let timer = null;
  function show() {
    note.textContent = t('st.saved');
    note.style.opacity = '1';
    clearTimeout(timer);
    timer = setTimeout(() => { note.style.opacity = '0'; }, 1800);
  }
  return { note, show };
}

/**
 * Autosave: merge the six learning fields into the current profile and PUT
 * it. On success — update the in-memory profile, apply theme/language
 * immediately (no screen reload), flash "Saved ✓". On error — banner at
 * the bottom of the panel; the selects keep the user's new values.
 */
function makeAutosave(panel, savedNote, bannerBox) {
  let busy = false;
  let lastError = null;
  return async (changed) => {
    if (busy) return;
    busy = true;
    try {
      const current = state.progress.profile;
      const { profile } = await api.updateProfile({ ...current, ...changed });
      state.progress.profile = profile;
      applyTheme();
      setLang(profile.language);
      lastError = null;
      bannerBox.replaceChildren();
      savedNote.show();
    } catch (err) {
      lastError = err;
      savedNote.note.style.opacity = '0';
      bannerBox.replaceChildren(errorBanner(err));
    } finally {
      busy = false;
    }
  };
}

export function learningPanel() {
  const { profile } = state.progress;
  const panel = el('div.panel', {});
  const savedNote = makeSavedStatus();
  const bannerBox = el('div', {});
  const save = makeAutosave(panel, savedNote, bannerBox);

  const nameInput = el('input', { id: 's-name', type: 'text', maxLength: 40, value: profile.name });
  nameInput.addEventListener('change', () => save({ name: nameInput.value }));

  const langSelect = el('select', { id: 's-lang' },
    el('option', { value: 'en', textContent: 'ENGLISH' }),
    el('option', { value: 'ru', textContent: 'РУССКИЙ' }),
    el('option', { value: 'zh', textContent: '中文' }),
  );
  langSelect.value = profile.language;
  langSelect.addEventListener('change', () => save({ language: langSelect.value }));

  const themeSelect = el('select', { id: 's-theme' },
    el('option', { value: 'light', textContent: t('st.themeLight') }),
    el('option', { value: 'dark', textContent: t('st.themeDark') }),
    el('option', { value: 'auto', textContent: t('st.themeAuto') }),
  );
  themeSelect.value = profile.theme;
  themeSelect.addEventListener('change', () => save({ theme: themeSelect.value }));

  const soundSelect = el('select', { id: 's-sound' },
    el('option', { value: 'on', textContent: t('st.soundOn') }),
    el('option', { value: 'off', textContent: t('st.soundOff') }),
  );
  soundSelect.value = profile.sound === false ? 'off' : 'on';
  soundSelect.addEventListener('change', () => save({ sound: soundSelect.value === 'on' }));

  // L2 — signal-word hints in practice questions: auto (default; off after
  // 100 answers), on (always), off (never). Invalid stored value → 'auto'.
  const signalSelect = el('select', { id: 's-signal-hints' },
    el('option', { value: 'auto', textContent: t('st.hintsAuto') }),
    el('option', { value: 'on', textContent: t('st.hintsOn') }),
    el('option', { value: 'off', textContent: t('st.hintsOff') }),
  );
  signalSelect.value = SIGNAL_HINT_MODES.includes(profile.signalHints) ? profile.signalHints : 'auto';
  signalSelect.addEventListener('change', () => save({ signalHints: signalSelect.value }));

  const storedGoal = Number.isInteger(profile.dailyGoal) ? profile.dailyGoal : DAILY_GOAL_DEFAULT;
  // A value outside the presets (set on an older build) still shows up.
  const goalOptions = DAILY_GOAL_CHOICES.includes(storedGoal)
    ? DAILY_GOAL_CHOICES
    : [...DAILY_GOAL_CHOICES, storedGoal].sort((a, b) => a - b);
  const goalSelect = el('select', { id: 's-goal' },
    ...goalOptions.map((n) => el('option', { value: String(n), textContent: t('st.goalQuestions', { n }) })),
  );
  goalSelect.value = String(storedGoal);
  goalSelect.addEventListener('change', () => save({ dailyGoal: Number(goalSelect.value) }));

  panel.append(
    el('h2', {}, t('st.learning')),
    el('div.field', {}, el('label', { htmlFor: 's-name' }, t('st.yourName')), nameInput),
    el('div.field', {}, el('label', { htmlFor: 's-lang' }, t('st.langLabel')), langSelect),
    el('div.field', {}, el('label', { htmlFor: 's-theme' }, t('st.themeLabel')), themeSelect),
    el('div.field', {}, el('label', { htmlFor: 's-sound' }, t('st.soundLabel')), soundSelect),
    el('div.field', {}, el('label', { htmlFor: 's-signal-hints' }, t('st.hintsLabel')), signalSelect),
    el('div.field', {}, el('label', { htmlFor: 's-goal' }, t('st.goalLabel')), goalSelect),
    el('div', { style: 'display:flex;gap:12px;align-items:baseline' }, savedNote.note, bannerBox),
  );
  return panel;
}

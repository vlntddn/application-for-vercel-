import { api } from '../api.js';
import { state } from '../state.js';
import { el, clear } from '../ui.js';
import { errorBanner } from './common.js';

/**
 * First-run tour: three slides, one idea each (exam format → learning loop →
 * where data lives). Name and language are collected here, not in Settings,
 * so a newcomer is never dropped into a wall of statistics.
 */
const ONBOARDING_STEPS = 3;

export function renderOnboarding(root, onDone) {
  let step = 0;
  let name = (state.progress.profile.name || '').trim();
  const langSelect = el('select', { id: 'ob-lang' },
    el('option', { value: 'en', textContent: 'ENGLISH' }),
    el('option', { value: 'ru', textContent: 'РУССКИЙ' }),
    el('option', { value: 'zh', textContent: '中文' }),
  );
  langSelect.value = state.progress.profile.language;

  async function save() {
    try {
      await api.updateProfile({
        name,
        language: langSelect.value,
        onboarded: true,
      });
      state.progress.profile = {
        ...state.progress.profile,
        name,
        language: langSelect.value,
        onboarded: true,
      };
      onDone();
    } catch (err) {
      root.prepend(errorBanner(err));
    }
  }

  function draw() {
    const dots = el('div.steps', { 'aria-hidden': 'true' },
      ...Array.from({ length: ONBOARDING_STEPS }, (_, i) =>
        el('span', { className: i <= step ? 'done' : '' })),
    );

    let content;
    if (step === 0) {
      const nameInput = el('input', {
        id: 'ob-name', type: 'text', maxLength: 40, value: name,
        placeholder: 'Your name (optional)',
      });
      content = [
        el('h1', {}, 'Welcome!'),
        el('p.lede', {}, 'The patente B exam: 30 questions, 20 minutes, at most 3 errors.'),
        el('p.stat-sub', {}, 'This app prepares you for it — on this device, offline, for free.'),
        el('div.field', {}, el('label', { htmlFor: 'ob-name' }, 'YOUR NAME'), nameInput),
        el('div.actions', {},
          el('button.btn', {
            onclick: () => { name = nameInput.value.trim(); save(); },
          }, 'SKIP THIS TOUR'),
          el('button.btn.btn-primary.btn-big', {
            onclick: () => {
              name = nameInput.value.trim();
              step = 1;
              draw();
            },
          }, 'CONTINUE →'),
        ),
      ];
    } else if (step === 1) {
      content = [
        el('h1', {}, 'How you will study'),
        el('p.lede', {}, 'Pick a topic and answer VERO or FALSO — read the theory when unsure, then take a mock exam.'),
        el('div.actions', {},
          el('button.btn.btn-primary.btn-big', {
            onclick: () => { step = 2; draw(); },
          }, 'CONTINUE →'),
        ),
      ];
    } else {
      content = [
        el('h1', {}, 'Your progress never leaves here'),
        el('p.lede', {}, 'Saved on this device only. In Settings you can export a backup file.'),
        el('div.field', {},
          el('label', { htmlFor: 'ob-lang' }, 'TRANSLATION LANGUAGE'),
          langSelect,
        ),
        el('div.actions', {},
          el('button.btn.btn-primary.btn-big', { onclick: () => save() }, 'START LEARNING →'),
        ),
      ];
    }

    clear(root, el('div.onboard', {}, el('div.panel', {}, dots, ...content)));

    if (step === 0) {
      root.querySelector('#ob-name')?.focus();
    }
  }

  draw();
}

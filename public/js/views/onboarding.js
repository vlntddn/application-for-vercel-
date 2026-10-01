import { api } from '../api.js';
import { state } from '../state.js';
import { el, clear } from '../ui.js';
import { setLang, t } from '../i18n.js';
import { errorBanner } from './common.js';

/**
 * First-run tour: three slides, one idea each. Language is collected FIRST
 * (before any translated text is shown), then name + exam format, then the
 * learning loop and where data lives (Q4.1). Name and language live here, not
 * in Settings, so a newcomer is never dropped into a wall of statistics.
 * The slide text switches live as the user changes the language select.
 */
const ONBOARDING_STEPS = 3;
const LANG_OPTIONS = [
  ['en', 'ENGLISH'], ['ru', 'РУССКИЙ'], ['zh', '中文'],
];

export function renderOnboarding(root, onDone) {
  let step = 0;
  let name = (state.progress.profile.name || '').trim();
  const langSelect = el('select', { id: 'ob-lang' },
    ...LANG_OPTIONS.map(([value, text]) => el('option', { value, textContent: text })),
  );
  langSelect.value = state.progress.profile.language || 'en';
  const applyLang = () => { setLang(langSelect.value); draw(); };
  langSelect.addEventListener('change', applyLang);
  setLang(langSelect.value);

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

  const nameInput = el('input', {
    id: 'ob-name', type: 'text', maxLength: 40, value: name,
  });
  nameInput.placeholder = t('ob.name.placeholder');

  function draw() {
    const dots = el('div.steps', { 'aria-hidden': 'true' },
      ...Array.from({ length: ONBOARDING_STEPS }, (_, i) =>
        el('span', { className: i <= step ? 'done' : '' })),
    );

    let content;
    if (step === 0) {
      nameInput.placeholder = t('ob.name.placeholder');
      content = [
        el('h1', {}, t('ob.title1')),
        el('p.lede', {}, t('ob.lede1')),
        el('p.stat-sub', {}, t('ob.sub1')),
        el('div.field', {},
          el('label', { htmlFor: 'ob-lang' }, t('ob.lang.label')), langSelect,
        ),
        el('div.field', {},
          el('label', { htmlFor: 'ob-name' }, t('ob.name.label')), nameInput,
        ),
        el('div.actions', {},
          el('button.btn', {
            onclick: () => { name = nameInput.value.trim(); save(); },
          }, t('ob.skip')),
          el('button.btn.btn-primary.btn-big', {
            onclick: () => {
              name = nameInput.value.trim();
              step = 1;
              draw();
            },
          }, t('ob.continue')),
        ),
      ];
    } else if (step === 1) {
      content = [
        el('h1', {}, t('ob.title2')),
        el('p.lede', {}, t('ob.lede2')),
        el('div.field', {},
          el('label', { htmlFor: 'ob-lang' }, t('ob.lang.label')), langSelect,
        ),
        el('div.actions', {},
          el('button.btn.btn-primary.btn-big', {
            onclick: () => { step = 2; draw(); },
          }, t('ob.continue')),
        ),
      ];
    } else {
      content = [
        el('h1', {}, t('ob.title3')),
        el('p.lede', {}, t('ob.lede3')),
        el('div.field', {},
          el('label', { htmlFor: 'ob-lang' }, t('ob.lang.label')), langSelect,
        ),
        el('div.actions', {},
          el('button.btn.btn-primary.btn-big', { onclick: () => save() }, t('ob.start')),
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

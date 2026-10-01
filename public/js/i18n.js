// UI-translation foundation (Q4.1). Dictionaries live here until each screen
// gets its own slice in Q4.2. `t(key)` resolves through the active language
// with an English fallback, and replaces {name} placeholders.
export const LANGUAGES = ['en', 'ru', 'zh'];

export const MESSAGES = {
  en: {
    'ob.title1': 'Welcome!',
    'ob.lede1': 'The patente B exam: 30 questions, 20 minutes, at most 3 errors.',
    'ob.sub1': 'This app prepares you for it — on this device, offline, for free.',
    'ob.name.label': 'YOUR NAME',
    'ob.name.placeholder': 'Your name (optional)',
    'ob.lang.label': 'LANGUAGE',
    'ob.skip': 'SKIP THIS TOUR',
    'ob.continue': 'CONTINUE →',
    'ob.title2': 'How you will study',
    'ob.lede2': 'Pick a topic and answer VERO or FALSO — read the theory when unsure, then take a mock exam.',
    'ob.title3': 'Your progress never leaves here',
    'ob.lede3': 'Saved on this device only. In Settings you can export a backup file.',
    'ob.start': 'START LEARNING →',
  },
  ru: {
    'ob.title1': 'Добро пожаловать!',
    'ob.lede1': 'Экзамен patente B: 30 вопросов, 20 минут, максимум 3 ошибки.',
    'ob.sub1': 'Это приложение готовит к нему — на этом устройстве, офлайн, бесплатно.',
    'ob.name.label': 'ВАШЕ ИМЯ',
    'ob.name.placeholder': 'Ваше имя (необязательно)',
    'ob.lang.label': 'ЯЗЫК',
    'ob.skip': 'ПРОПУСТИТЬ ОЗНАКОМЛЕНИЕ',
    'ob.continue': 'ПРОДОЛЖИТЬ →',
    'ob.title2': 'Как вы будете учиться',
    'ob.lede2': 'Выбирайте тему и отвечайте VERO или FALSO — при сомнениях читайте теорию, затем сдайте пробный экзамен.',
    'ob.title3': 'Ваш прогресс никуда не уходит',
    'ob.lede3': 'Хранится только на этом устройстве. В настройках можно выгрузить файл резервной копии.',
    'ob.start': 'НАЧАТЬ УЧЕБУ →',
  },
  zh: {
    'ob.title1': '欢迎！',
    'ob.lede1': 'Patente B 考试：30 道题，20 分钟，最多 3 个错误。',
    'ob.sub1': '本应用帮你备考——就在这个设备上，离线、免费。',
    'ob.name.label': '您的名字',
    'ob.name.placeholder': '您的名字（可选）',
    'ob.lang.label': '语言',
    'ob.skip': '跳过介绍',
    'ob.continue': '继续 →',
    'ob.title2': '您如何学习',
    'ob.lede2': '选择一个主题，回答 VERO 或 FALSO——拿不准时阅读理论，然后参加模拟考试。',
    'ob.title3': '您的学习进度不会被带离这里',
    'ob.lede3': '只保存在此设备上。您可以在设置中导出备份文件。',
    'ob.start': '开始学习 →',
  },
};

let activeLang = 'en';

/** Set the active language (unknown values fall back to 'en'). */
export function setLang(lang) {
  activeLang = LANGUAGES.includes(lang) ? lang : 'en';
}

/** Active language code ('en' | 'ru' | 'zh'). */
export function lang() {
  return activeLang;
}

/** Translate a key; replaces {name} placeholders; falls back to EN. */
export function t(key, params) {
  let s = MESSAGES[activeLang]?.[key] ?? MESSAGES.en[key];
  if (s === undefined) return key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      s = s.replaceAll(`{${k}}`, String(v));
    }
  }
  return s;
}

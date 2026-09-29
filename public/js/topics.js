// Topic labels (S2.10). data/manifest.json names are all-lowercase slugs;
// this is the single source of human-readable topic names.
// Per design system Card spec: title in the exam language (sentence case),
// sub-line in the learner's language.
import { state } from './state.js';

export const TOPICS = {
  'definizioni-generali-doveri-strada': {
    label: { it: 'Definizioni generali e doveri nella strada', en: 'General definitions and road duties', ru: 'Общие определения и обязанности на дороге', zh: '通用定义与道路义务' },
    sub: { en: 'Basic words and rules every driver must know.', ru: 'Базовые слова и правила, которые обязан знать каждый водитель.' },
  },
  'segnali-pericolo': {
    label: { it: 'Segnali di pericolo', en: 'Danger signs', ru: 'Предупреждающие знаки', zh: '警告标志' },
    sub: { en: 'Warnings about what lies ahead on the road.', ru: 'Знаки, предупреждающие о том, что впереди на дороге.' },
  },
  'segnali-divieto': {
    label: { it: 'Segnali di divieto', en: 'Prohibition signs', ru: 'Запрещающие знаки', zh: '禁止标志' },
    sub: { en: 'What you are not allowed to do.', ru: 'Что вам делать запрещено.' },
  },
  'segnali-obbligo': {
    label: { it: 'Segnali di obbligo', en: 'Mandatory signs', ru: 'Знаки обязательного предписания', zh: '指令标志' },
    sub: { en: 'What you must do.', ru: 'Что вы обязаны делать.' },
  },
  'segnali-precedenza': {
    label: { it: 'Segnali di precedenza', en: 'Priority signs', ru: 'Знаки приоритета', zh: '优先标志' },
    sub: { en: 'Who goes first.', ru: 'Кто имеет право первой очереди.' },
  },
  'segnaletica-orizzontale-ostacoli': {
    label: { it: 'Segnaletica orizzontale e ostacoli', en: 'Road markings and obstacles', ru: 'Дорожная разметка и препятствия', zh: '路面标线与障碍' },
    sub: { en: 'Lines and signs painted on the road.', ru: 'Линии и знаки, нанесённые на дорогу.' },
  },
  'semafori-vigili': {
    label: { it: 'Semafori e agenti di polizia', en: 'Traffic lights and police officers', ru: 'Светофоры и полицейские', zh: '交通信号灯与警察' },
    sub: { en: 'Signals you must obey without exception.', ru: 'Сигналы, которым вы обязаны подчиняться без исключений.' },
  },
  'segnali-indicazione': {
    label: { it: 'Segnali di indicazione', en: 'Information signs', ru: 'Указательные знаки', zh: '指路标志' },
    sub: { en: 'Wayfinding, services and directions.', ru: 'Навигация, услуги и направления.' },
  },
  'segnali-complementari-cantiere': {
    label: { it: 'Segnali complementari e cantieri', en: 'Supplementary signs and roadworks', ru: 'Дополнительные знаки и стройки', zh: '辅助标志与施工区' },
    sub: { en: 'Panels that change the meaning of a sign.', ru: 'Табло, меняющие значение знака.' },
  },
  'pannelli-integrativi': {
    label: { it: 'Pannelli integrativi', en: 'Supplementary panels', ru: 'Дополнительные таблички', zh: '辅助标牌' },
    sub: { en: 'The small panels under a sign.', ru: 'Маленькие таблички под знаком.' },
  },
  'limiti-di-velocita': {
    label: { it: 'Limiti di velocità', en: 'Speed limits', ru: 'Ограничение скорости', zh: '速度限制' },
    sub: { en: 'The numbers on the road — and what they mean.', ru: 'Цифры на дороге и что они означают.' },
  },
  'distanza-di-sicurezza': {
    label: { it: 'Distanza di sicurezza', en: 'Safe following distance', ru: 'Безопасная дистанция', zh: '安全车距' },
    sub: { en: 'How far to keep from the car in front.', ru: 'Какое расстояние держать до машины впереди.' },
  },
  'norme-di-circolazione': {
    label: { it: 'Norme di circolazione', en: 'Rules of the road', ru: 'Правила движения', zh: '行驶规则' },
    sub: { en: 'How to drive in traffic, day and night.', ru: 'Как ехать в потоке днём и ночью.' },
  },
  'precedenza-incroci': {
    label: { it: 'Precedenza agli incroci', en: 'Right of way at intersections', ru: 'Право первой очереди на перекрёстках', zh: '交叉口优先权' },
    sub: { en: 'Who goes first when the roads meet.', ru: 'Кто едет первым, когда дороги пересекаются.' },
  },
  'sorpasso': {
    label: { it: 'Sorpasso', en: 'Overtaking', ru: 'Обгон', zh: '超车' },
    sub: { en: 'When and how you may pass another vehicle.', ru: 'Когда и как можно обогнать другой автомобиль.' },
  },
  'fermata-sosta-arresto': {
    label: { it: 'Fermata, sosta e arresto', en: 'Stopping, parking and halting', ru: 'Остановка, стоянка и задержка', zh: '停车、驻留与临时停留' },
    sub: { en: 'The difference between fermata and sosta.', ru: 'В чём разница между остановкой и стоянкой.' },
  },
  'norme-varie-autostrade-pannelli': {
    label: { it: 'Norme varie, autostrade e pannelli', en: 'Miscellaneous rules, highways and panels', ru: 'Разное, автомагистрали и табло', zh: '其他规则、高速公路与电子标牌' },
    sub: { en: 'Highway rules and electronic panels.', ru: 'Правила для шоссе и электронные табло.' },
  },
  'luci-dispositivi-acustici': {
    label: { it: 'Luci, dispositivi e segnali acustici', en: 'Lights, devices and audible signals', ru: 'Свет, приборы и звуковые сигналы', zh: '灯光、装置与声音信号' },
    sub: { en: 'Headlights, indicators and the horn.', ru: 'Фары, поворотники и сигналы.' },
  },
  'cinture-casco-sicurezza': {
    label: { it: 'Cinture, casco e sicurezza', en: 'Seatbelts, helmets and safety', ru: 'Ремень безопасности, шлем и безопасность', zh: '安全带、头盔与安全' },
    sub: { en: 'Seatbelts and child restraints.', ru: 'Ремни безопасности и автокресла для детей.' },
  },
  'patente-punti-documenti': {
    label: { it: 'Patente, punti e documenti', en: 'Licence, points and documents', ru: 'Права, баллы и документы', zh: '驾照、积分与证件' },
    sub: { en: 'The points system and what to carry with you.', ru: 'Система баллов и что всегда иметь при себе.' },
  },
  'incidenti-stradali-comportamenti': {
    label: { it: 'Incidenti stradali e comportamenti', en: 'Road accidents and behaviour', ru: 'Дорожно-транспортные происшествия', zh: '交通事故与行为' },
    sub: { en: 'What to do after a crash.', ru: 'Что делать после аварии.' },
  },
  'alcool-droga-primo-soccorso': {
    label: { it: 'Alcol, droga e primo soccorso', en: 'Alcohol, drugs and first aid', ru: 'Алкоголь, наркотики и первая помощь', zh: '酒精、毒品与急救' },
    sub: { en: 'Limits, risks and first aid.', ru: 'Пределы, риски и первая помощь.' },
  },
  'responsabilita-civile-penale-e-assicurazione': {
    label: { it: 'Responsabilità civile, penale e assicurazione', en: 'Civil and criminal liability, insurance', ru: 'Гражданская и уголовная ответственность, страховка', zh: '民事与刑事责任、保险' },
    sub: { en: 'Who pays for a crash.', ru: 'Кто оплачивает ущерб от аварии.' },
  },
  'consumi-ambiente-inquinamento': {
    label: { it: 'Consumi, ambiente e inquinamento', en: 'Fuel use, environment and pollution', ru: 'Расход, экология и загрязнение', zh: '油耗、环境与污染' },
    sub: { en: 'Driving gently saves money and air.', ru: 'Мягкая езда экономит деньги и воздух.' },
  },
  'elementi-veicolo-manutenzione-comportamenti': {
    label: { it: 'Elementi del veicolo, manutenzione e comportamenti', en: 'Vehicle parts, maintenance and behaviour', ru: 'Устройство автомобиля, обслуживание', zh: '车辆部件、维护与行为' },
    sub: { en: 'Parts, checks and how to behave in traffic.', ru: 'Агрегаты, проверки и поведение на дороге.' },
  },
};

const LEARNER_LANGS = ['en', 'ru', 'zh'];

function learnerLang() {
  const l = state.progress.profile?.language || 'en';
  return LEARNER_LANGS.includes(l) ? l : 'en';
}

/** Exam-language (Italian) title, sentence case, with real prepositions. */
export function topicLabel(cat) {
  const t = TOPICS[cat.slug];
  if (t && t.label && t.label.it) return t.label.it;
  return cat.name.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Sub-line in the learner's language ('' until a translation exists). */
export function topicSub(cat) {
  const t = TOPICS[cat.slug];
  return t && t.sub ? t.sub[learnerLang()] || '' : '';
}

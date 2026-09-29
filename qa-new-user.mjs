/**
 * QA-сценарий нового пользователя (Фаза 2.2).
 *
 * Чистый профиль: сбрасываем /api/progress, поднимаем headless Chrome с
 * временным профилем, проходим путь «человек, который никогда не видел
 * приложение»:
 *   онбординг → практика 5 вопросов → теория 1 главы + self-check →
 *   экзамен 5 минут (не доигрывая) → закрыть и открыть заново.
 *
 * Каждый шаг проверяет, что экран объясняет, зачем он нужен (lede/текст),
 * а в конце — что ничего не потеряно. Вывод — PASS/FAIL по пунктам и
 * итоговый счёт; код выхода 1 при любом FAIL.
 *
 * Запуск: node qa-new-user.mjs
 *   По умолчанию поднимает СВОЙ сервер на :3919 со временным STORAGE_DIR —
 *   чужой прогресс (сервер владельца на :3000) не трогается.
 *   QA_URL=http://127.0.0.1:3000 node qa-new-user.mjs — прогон по уже
 *   запущенному серверу (ВНИМАНИЕ: сбросит его прогресс через DELETE).
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DEV = 'http://127.0.0.1:9333';
const TEMP = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-qa-'));
const QA_PORT = process.env.QA_PORT || '3919';
const APP = process.env.QA_URL || `http://127.0.0.1:${QA_PORT}`;
// Свой сервер со своим хранилищем, если не задан QA_URL.
let ownServer = null;
if (!process.env.QA_URL) {
  const storage = path.join(TEMP, 'storage');
  fs.mkdirSync(storage, { recursive: true });
  ownServer = spawn(process.execPath, ['server/index.js'], {
    cwd: path.dirname(new URL(import.meta.url).pathname),
    env: { ...process.env, PORT: QA_PORT, STORAGE_DIR: storage },
    stdio: 'ignore',
  });
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(`${APP}/api/health`)).ok) break; } catch { /* ещё не поднялся */ }
    await new Promise((r) => setTimeout(r, 200));
  }
}
const SHOTS = path.join(TEMP, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (s) => console.log(`[qa] ${s}`);

const jsErrors = []; // Runtime.exceptionThrown за весь прогон
let passes = 0;
let failures = 0;
function check(cond, name) {
  if (cond) { passes++; log(`PASS — ${name}`); }
  else { failures++; log(`FAIL — ${name}`); }
  return cond;
}

/* ---- CDP поверх WebSocket (stdlib WebSocket, Node >= 21) ---- */
let ws, seq = 0;
const pending = new Map();
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++seq;
  pending.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params }));
});
/** Выражение в DOM-контексте. Возвращает значение (returnByValue). */
const evaluate = (expression) =>
  send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    .then((r) => {
      if (r.exceptionDetails) throw new Error(`JS: ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`);
      return r.result.value;
    });

/**
 * Ждём, пока строка-предикат в DOM вернёт строго `true`.
 * Строка (не функция): не пересекает CDP, нет ловушки с `() => \`...\``.
 * Если предикат вернул не-boolean — бросаем сразу, а не тикаем до таймаута.
 */
async function waitFor(predicate, what, timeout = 25000) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const v = await evaluate(predicate);
    if (v === true) return;
    if (typeof v !== 'boolean') throw new Error(`предикат вернул ${typeof v} (${JSON.stringify(v)}) вместо boolean: ${what} | ${predicate}`);
    if (Date.now() > deadline) throw new Error(`таймаут: ${what}`);
    await sleep(250);
  }
}

const viewText = () => evaluate(`document.getElementById('view')?.innerText || ''`);
const shot = (name) => send('Page.captureScreenshot', { format: 'png' })
  .then((r) => fs.writeFileSync(path.join(SHOTS, name), Buffer.from(r.data, 'base64')));

/* ---- запуск Chrome + вставка вкладки ---- */
const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=9333`, `--user-data-dir=${path.join(TEMP, 'chrome')}`,
  '--no-first-run', '--no-default-browser-check', '--disable-features=Translate', '--window-size=1280,900', 'about:blank',
], { stdio: 'ignore' });

async function connectTab() {
  for (let i = 0; i < 40; i++) {
    try { await fetch(`${DEV}/json/version`); break; } catch { await sleep(500); }
  }
  const tabRes = await fetch(`${DEV}/json/new?${encodeURIComponent(`${APP}/`)}`, { method: 'PUT' });
  const tab = await tabRes.json();
  const target = (await (await fetch(`${DEV}/json`)).json()).find((x) => x.id === tab.id);
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = () => j(new Error('ws fail')); });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? reject(new Error(`CDP: ${m.error.message}`)) : resolve(m.result);
    } else if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      jsErrors.push(d.exception?.description?.split('\n')[0] || d.text);
    }
  };
  await send('Page.enable');
  await send('Runtime.enable');
}

/** Клик по кнопке/ссылке, чей text совпадает (или содержит) label. */
const click = (label) => evaluate(`(() => {
  const b = Array.from(document.querySelectorAll('#view button, #view a'))
    .find((x) => (x.innerText || '').trim() === ${JSON.stringify(label)}
        || (x.innerText || '').includes(${JSON.stringify(label)}));
  if (b) { b.click(); return true; } return false;
})()`);

/** Ответить на текущий вопрос практики/экзамена: value=true → VERO, false → FALSO. */
const answer = (value) => evaluate(`document.querySelector(${JSON.stringify(value ? '#view .btn-true' : '#view .btn-false')})?.click() || false`);

/** Прочитать текущий вопрос: {id, is_true} из text (id не в DOM). */
const currentQuestion = () => evaluate(`document.querySelector('#view .question-text')?.textContent || ''`);

async function main() {
  // 0. чистый профиль + sanity-чек сервера
  const health = await (await fetch(`${APP}/api/health`)).json();
  log(`health: ${JSON.stringify(health)}`);
  const before = await (await fetch(`${APP}/api/progress`)).json();
  log(`профиль до: ${JSON.stringify(summarize(before))}`);
  await fetch(`${APP}/api/progress`, { method: 'DELETE' });
  const reset = await (await fetch(`${APP}/api/progress`)).json();
  check(reset.profile && reset.profile.onboarded === false, 'профиль сброшен в чистый');

  await connectTab();
  await waitFor(`!!document.getElementById('view')`, 'app boot', 30000);

  /* ---- 1. Онбординг ---- */
  await waitFor(`!!document.getElementById('ob-name')`, 'onboarding step 1');
  let txt = await viewText();
  check(txt.includes('30 questions, 20 minutes'), 'шаг 1 объясняет формат экзамена (lede)');
  check(/offline, for free|for free/i.test(txt), 'шаг 1: где живёт прогресс и цена');
  check(await evaluate(`document.querySelector('nav') ? getComputedStyle(document.querySelector('nav')).display === 'none' : false`), 'навигация скрыта до онбординга');
  await shot('01-onboarding.png');
  await evaluate(`(() => { const i = document.querySelector('#ob-name'); i.value='QA'; i.dispatchEvent(new Event('input',{bubbles:true})); return true; })()`);
  await click('CONTINUE');
  // h1 рендерится uppercase (text-transform), сравниваем без учёта регистра
  await waitFor(`(document.getElementById('view')?.innerText||'').toUpperCase().includes('HOW YOU WILL STUDY')`, 'onboarding step 2');
  txt = await viewText();
  check(/VERO or FALSO/i.test(txt), 'шаг 2 объясняет механику (VERO/FALSO)');
  await click('CONTINUE');
  await waitFor(`(document.getElementById('view')?.innerText||'').toUpperCase().includes('YOUR PROGRESS NEVER LEAVES HERE')`, 'onboarding step 3');
  await shot('02-onboarding-lang.png');
  await click('START LEARNING');

  /* ---- 2. Дашборд (первый экран после онбординга) ---- */
  await waitFor(`(document.getElementById('view')?.innerText||'').includes('CIAO, QA')`, 'dashboard');
  txt = await viewText();
  check(/READY FOR THE EXAM|KEEP THE STREAK/i.test(txt), 'дашборд объясняет, что делать дальше (lede)');
  check(await evaluate(`document.querySelector('nav') ? getComputedStyle(document.querySelector('nav')).display !== 'none' : false`), 'навигация появилась после онбординга');
  await shot('03-dashboard.png');

  /* ---- 2a. L5b: путь ведёт новичка в урок 1 ---- */
  await waitFor(`!!document.getElementById('dashboard-learning-path')`, 'карточка пути на дашборде');
  txt = await viewText();
  check(txt.includes('Step 1 of 25'), 'путь: новичок стоит на шаге 1 из 25');
  // hashchange не срабатывает, если hash уже #/path — подписываемся вручную
  await evaluate(`window.__pathNav = () => { if (location.hash !== '#/path') location.hash = '#/path'; else location.replace(location.href); window.removeEventListener('hashchange', window.__pathNav); }`);
  await evaluate(`window.addEventListener('hashchange', window.__pathNav); window.__pathNav();`);
  await waitFor(`(document.getElementById('view')?.innerText||'').toUpperCase().includes('LEARNING PATH')`, 'экран пути');
  txt = await viewText();
  check(/LEARNING PATH/i.test(txt), 'путь: экран #/path рендерит заголовок');
  check(/Step 1 of 25/i.test(txt), 'путь: первый шаг — шаг 1 из 25');
  const contHref = await evaluate(`(() => {
    const a = Array.from(document.querySelectorAll('#view .path-card a.ds-btn'))
      .find((x) => ((x.innerText || '') + ' ' + (x.textContent || '')).toLowerCase().includes('continue'));
    return a ? a.getAttribute('href') : null;
  })()`);
  check(contHref === '#/theory/ch1', `путь: Continue новичка ведёт в урок 1 (${contHref})`);
  await shot('03b-path.png');

  /* ---- 3. Практика: тема → 5 вопросов → результат ---- */
  await evaluate(`location.hash = '#/practice'`);
  await waitFor(`!!Array.from(document.querySelectorAll('#view a.card')).length`, 'practice list');
  txt = await viewText();
  check(/PICK A TOPIC|UNSEEN AND WRONG QUESTIONS COME FIRST/i.test(txt), 'практика: lede объясняет задачу');
  // берём тему, у которой точно есть вопросы (distanza di sicurezza)
  await waitFor(`!!Array.from(document.querySelectorAll('#view a.card')).find(a => (a.href||'').includes('distanza-di-sicurezza'))`, 'topic card');
  await evaluate(`Array.from(document.querySelectorAll('#view a.card')).find(a => (a.href||'').includes('distanza-di-sicurezza')).click()`);
  await waitFor(`!!document.querySelector('#view .question-card')`, 'practice question 1');
  txt = await viewText();
  check(/EASY START/i.test(txt), 'новичок: EASY START (первый заведомый успех)');
  await shot('04-practice.png');
  const practiced = await practiceRound(25);
  check(practiced, 'практика: 20 вопросов отвечены до конца сессии');
  check(/SESSION COMPLETE/i.test(await viewText()), 'практика: экран результата есть');
  await shot('05-practice-done.png');

  /* ---- 4. Теория: глава 1 → пометка «прочитано» → self-check ---- */
  await evaluate(`location.hash = '#/theory/ch1'`);
  await waitFor(`!!document.querySelector('#view .question-card, #view .lesson-objective, #view button') && (document.getElementById('view')?.innerText||'').length > 80`, 'theory ch1', 30000);
  await waitFor(`(document.getElementById('view')?.innerText||'').includes('IN THIS LESSON') || (document.getElementById('view')?.innerText||'').includes('CHECK YOURSELF')`, 'theory ch1 rendered', 30000);
  txt = await viewText();
  check(/CHAPTER 1/.test(txt), 'теория: заголовок главы 1');
  check(/MARK AS READ/.test(txt), 'теория: можно пометить как прочитанное');
  check(/CHECK YOURSELF|QUICK CHECK/.test(txt), 'теория: есть self-check');
  await shot('06-theory-ch1.png');
  await click('MARK AS READ');
  await waitFor(`(document.getElementById('view')?.innerText||'').includes('MARKED AS READ')`, 'ch1 marked read');
  check((await viewText()).includes('MARKED AS READ'), 'теория: ч1 помечена прочитанной');
  await click('QUICK CHECK');
  await waitFor(`!!document.querySelector('#view .question-card')`, 'self-check question');
  const checked = await practiceRound(5);
  check(checked, 'self-check: 5 вопросов отвечены');
  await waitFor(`(document.getElementById('view')?.innerText||'').toLowerCase().includes('self-check')`, 'self-check result');
  check((await viewText()).toLowerCase().includes('self-check'), 'self-check: результат вернулся на главу');
  await shot('07-theory-selfcheck.png');

  /* ---- 5. Экзамен: пре-старт + 5 минут (не доигрывая) ---- */
  await evaluate(`location.hash = '#/exam'`);
  await waitFor(`(document.getElementById('view')?.innerText||'').includes('HOW THE REAL EXAM WORKS')`, 'exam pre-start');
  txt = await viewText();
  check(/THIS IS PRACTICE, NOT THE OFFICIAL EXAM/i.test(txt), 'экзамен: честная строка «это тренировка»');
  check(/30 RANDOM QUESTIONS/i.test(txt) && /20 MINUTES/i.test(txt) && /AT MOST 3 ERRORS/i.test(txt), 'экзамен: объясняет 30/20/3');
  await shot('08-exam-presstart.png');
  await click('BEGIN EXAM');
  await waitFor(`!!document.querySelector('#view .timer')`, 'exam running (timer)');
  const t1 = await evaluate(`document.querySelector('#view .timer')?.textContent || ''`);
  await sleep(2200);
  const t2 = await evaluate(`document.querySelector('#view .timer')?.textContent || ''`);
  check(t1 !== t2 && /^\d{1,2}:\d{2}$/.test(t1), `экзамен: таймер идёт (${t1} → ${t2})`);
  // отвечаем несколько вопросов, чтобы прогресс реально сохранился
  for (let i = 0; i < 3; i++) {
    await waitFor(`!!document.querySelector('#view .btn-true')`, 'exam question ' + i);
    await answer(true);
    await sleep(300);
  }
  await shot('09-exam-running.png');
  // уходим НЕ доигрывая: экзамен прерывается, прогресс не засчитывается как результат
  log('покидаем экзамен без завершения (5 минут не доигрываем)');

  /* ---- 6. Закрыть и открыть заново: ничего не потеряно ---- */
  // перезагрузка остаётся на #/exam (прерванный экзамен → прес-старт);
  // дашборд открываем явно
  await evaluate(`location.reload()`);
  await waitFor(`(document.getElementById('view')?.innerText||'').includes('CIAO, QA') || (document.getElementById('view')?.innerText||'').includes('HOW THE REAL EXAM WORKS')`, 'app reopened', 30000);
  await evaluate(`location.hash = '#/'`);
  await waitFor(`(document.getElementById('view')?.innerText||'').includes('CIAO, QA')`, 'reopened dashboard', 30000);
  txt = await viewText();
  check(!txt.includes('Welcome!') && !txt.includes('How you will study'), 'после перезапуска онбординг НЕ показан снова');
  check(txt.includes('CIAO, QA'), 'после перезапуска имя сохранено');
  await shot('10-reopened.png');

  // финальная сверка по API
  const after = await (await fetch(`${APP}/api/progress`)).json();
  const s = summarize(after);
  log(`профиль после: ${JSON.stringify(s)}`);
  check(after.profile && after.profile.name === 'QA' && after.profile.onboarded === true, 'persist: имя и onboarded сохранились');

  /* ---- 7. Каждый экран открывается без JS-ошибок ----
   * Ловит потерянные при рефакторинге импорты/константы (S1.3 потерял
   * DAILY_GOAL_CHOICES — Settings не открывался, а тесты молчали). */
  const ROUTES = ['#/', '#/theory', '#/practice', '#/exam', '#/mistakes', '#/review',
    '#/search', '#/dictionary', '#/path', '#/stats', '#/settings', '#/exam-italian'];
  for (const r of ROUTES) {
    const before = jsErrors.length;
    await evaluate(`location.hash = ${JSON.stringify(r)}`);
    await sleep(900);
    const len = await evaluate(`(document.getElementById('view')?.innerText || '').trim().length`);
    const errs = jsErrors.slice(before);
    check(errs.length === 0 && len > 40, `экран ${r} открывается без JS-ошибок${errs.length ? ': ' + errs.join('; ') : ''}`);
  }
  check(jsErrors.length === 0, `за весь прогон ни одной JS-ошибки${jsErrors.length ? ': ' + jsErrors.join('; ') : ''}`);
  const answerCount = Object.keys(after.answers || {}).length;
  check(answerCount >= 5, `persist: ответы сохранены (${answerCount})`);
  check((after.theoryRead || []).includes('ch1'), 'persist: ч1 помечена прочитанной');
}

/**
 * Ответить текущую quiz-сессию до конца (практика — 20 вопросов,
 * self-check — 5): VERO → фидбек → NEXT → … → FINISH (на последнем)
 * → экран результата. max — защита от зацикливания.
 */
async function practiceRound(max) {
  for (let i = 0; i < max; i++) {
    if (!(await evaluate(`!!document.querySelector('#view .question-card')`))) {
      // сессия уже закончена (экран результата) — успех
      return true;
    }
    // читаем is_true через текст не выходит — кликаем VERO,
    // это не важно для QA (проверяем механику, не правильность).
    await answer(true);
    await waitFor(`!!document.querySelector('#view .ds-feedback')`, `feedback ${i + 1}`);
    // NEXT → — на каждом вопросе, FINISH — только на последнем
    if (!(await click('NEXT') || await click('FINISH'))) {
      log(`debug: кнопки NEXT/FINISH не найдены; кнопки: ${await evaluate(`JSON.stringify(Array.from(document.querySelectorAll('#view button')).map(b => b.innerText.trim()).slice(0, 10))`)}`);
      log(`debug: текст view: ${(await viewText()).replace(/\n/g, ' | ').slice(0, 300)}`);
      return false;
    }
    await sleep(300);
  }
  // лимит max исчерпан: успех, только если вопрос больше не виден
  return !(await evaluate(`!!document.querySelector('#view .question-card')`));
}

function summarize(p) {
  return {
    name: p.profile?.name, onboarded: p.profile?.onboarded,
    answered: Object.keys(p.answers || {}).length,
    exams: (p.exams || []).length, read: (p.theoryRead || []).length,
    profile: p.profile,
  };
}

let serverPid = null;
try {
  await main();
  console.log(`\n[qa] ИТОГО: ${passes} PASS, ${failures} FAIL`);
  console.log(`[qa] скриншоты: ${SHOTS}`);
  const code = failures ? 1 : 0;
  process.on('beforeExit', () => chrome.kill('SIGKILL'));
  process.exitCode = code;
} catch (err) {
  console.error(`[qa] ОШИБКА: ${err.message}`);
  try { await shot('99-error.png'); } catch { /* ignore */ }
  process.exitCode = 1;
} finally {
  try { ws && ws.close(); } catch { /* ignore */ }
  try { chrome.kill('SIGKILL'); } catch { /* ignore */ }
  try { ownServer && ownServer.kill('SIGTERM'); } catch { /* ignore */ }
  await sleep(400);
  try { fs.rmSync(TEMP, { recursive: true, force: true }); } catch { /* ignore */ }
  console.log(`[qa] chrome остановлен, ${TEMP} убран`);
}

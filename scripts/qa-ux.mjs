/**
 * UX-аудит (Спринт 2, задача S2.1). Базовая линия: сколько FAIL по каждой
 * из 8 проверок — приложение в этом запуске НЕ чинится, скрипт только меряет.
 *
 * CDP-хелперы переиспользуются из qa-new-user.mjs (тот же подход):
 * headless Chrome, Runtime.evaluate, чистый профиль через DELETE /api/progress.
 * Свой сервер на :3921 (UX_PORT) со временным STORAGE_DIR — сервер владельца на :3000
 * не трогается (запрет из протокола).
 *
 * Маршруты: #/, #/theory, #/practice, #/exam, #/mistakes, #/settings,
 * #/stats, #/search, #/dictionary, #/review + онбординг (чистый профиль).
 * Вьюпорты: 375×812 и 1280×800 (Emulation.setDeviceMetricsOverride).
 *
 * Проверки (каждая — строка PASS/FAIL с селектором виновника):
 *  1. нет горизонтального скролла (scrollWidth <= innerWidth, ±1 px —
 *     округление border'ов в 16:9);
 *  2. каждая видимая кнопка/ссылка ≥ 44×44 px (кроме ссылок внутри текста);
 *  3. ровно один пункт нижнего меню с aria-current, и он соответствует
 *     разделу (карта: stats/records → HOME, review/search → PRACTICE,
 *     dictionary → THEORY);
 *  4. нет видимого текста storage/, .json, undefined, NaN, null;
 *  5. контраст текста ≥ 4.5:1 (computed color + фактический background —
 *     по цепочке до первого непрозрачного);
 *  6. шапка ≤ 64 px по высоте на 375 px;
 *  7. у новичка на #/ блок .dashboard-next-steps целиком в первых 812 px;
 *  8. текст кнопок не переносится (высота ≤ 1.6 × line-height + паддинги).
 *
 * Скрипт НЕ в npm test (нужен Chrome). Вывод — PASS/FAIL по строкам + сводка
 * «сколько FAIL по каждой проверке» (базовая линия для DEVLOG).
 * Код выхода 1 только если скрипт упал с ошибкой — сами FAIL-и дают 0,
 * потому что базовая линия по заданию сейчас ожидаемо красная.
 *
 * Запуск: node scripts/qa-ux.mjs
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DEV = 'http://127.0.0.1:9333';
const TEMP = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-ux-'));
const PORT = process.env.UX_PORT || '3921'; // 3917 — verify.sh, 3919 — qa-new-user
const APP = `http://127.0.0.1:${PORT}`;
const VIEWPORTS = [{ w: 375, h: 812 }, { w: 1280, h: 800 }];

// Порт должен быть свободен ДО запуска нашего сервера, иначе скрипт
// будет мерить чужой сервер.
{
  const net = await import('node:net');
  const portTaken = await new Promise((res) => {
    const s = net.createServer();
    s.once('error', () => res(true));
    s.once('listening', () => s.close(() => res(false)));
    s.listen(Number(PORT), '127.0.0.1');
  });
  if (portTaken) {
    console.error(`[ux] ОШИБКА: порт ${PORT} уже занят другим процессом. Освободите его (или UX_PORT=...) и перезапустите.`);
    process.exit(1);
  }
}

const storage = path.join(TEMP, 'storage');
fs.mkdirSync(storage, { recursive: true });
// Проверка занятости ДО запуска своего сервера: иначе увидим свой же bind.
const net = await import('node:net');
const portTaken = await new Promise((res) => {
  const s = net.createServer();
  s.once('error', () => res(true));
  s.once('listening', () => s.close(() => res(false)));
  s.listen(Number(PORT), '127.0.0.1');
});
if (portTaken) {
  console.error(`[ux] ОШИБКА: порт ${PORT} уже занят другим процессом. Освободите его и перезапустите.`);
  process.exit(1);
}
const ownServer = spawn(process.execPath, ['../server/index.js'], {
  cwd: path.dirname(new URL(import.meta.url).pathname),
  env: { ...process.env, PORT, STORAGE_DIR: storage },
  stdio: 'ignore',
});
let serverUp = false;
for (let i = 0; i < 50; i++) {
  try { if ((await fetch(`${APP}/api/health`)).ok) { serverUp = true; break; } } catch { /* ещё не поднялся */ }
  await new Promise((r) => setTimeout(r, 200));
}
if (!serverUp) {
  console.error(`[ux] ОШИБКА: сервер на ${APP}/api/health не поднялся за 10 с (проверьте путь ../server/index.js и порт ${PORT}).`);
  ownServer.kill();
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (s) => console.log(`[ux] ${s}`);

/* ---- CDP (как в qa-new-user.mjs) ---- */
let ws, seq = 0;
const pending = new Map();
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++seq;
  pending.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params }));
});
const evaluate = (expression) =>
  send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    .then((r) => {
      if (r.exceptionDetails) throw new Error(`JS: ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`);
      return r.result.value;
    });

async function connectTab(url) {
  for (let i = 0; i < 40; i++) {
    try { await fetch(`${DEV}/json/version`); break; } catch { await sleep(500); }
  }
  const tabRes = await fetch(`${DEV}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
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
    }
    // диагностика: ловим ошибки JS в консоли страницы
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      console.log(`[ux] JS-ОШИБКА: ${d.exception?.description || d.text}`);
    }
  };
  await send('Page.enable');
  await send('Runtime.enable');
}

/* ---- маршруты: hash, id (для карты меню), ожидание отрисовки ---- */
const ROUTES = [
  { hash: '#/', id: 'dashboard', wait: `(document.getElementById('view')?.innerText||'').length > 100` },
  { hash: '#/theory', id: 'theory', wait: `!!document.querySelector('#view a.card, #view .lesson-objective')` },
  { hash: '#/practice', id: 'practice', wait: `!!document.querySelector('#view a.card, #view .question-card')` },
  { hash: '#/exam', id: 'exam', wait: `(document.getElementById('view')?.innerText||'').length > 100` },
  { hash: '#/mistakes', id: 'mistakes', wait: `(document.getElementById('view')?.innerText||'').length > 20` },
  { hash: '#/settings', id: 'settings', wait: `!!document.querySelector('#view button, #view select, #view label')` },
  { hash: '#/stats', id: 'stats', wait: `(document.getElementById('view')?.innerText||'').length > 100` },
  { hash: '#/search', id: 'search', wait: `!!document.querySelector('#view input')` },
  { hash: '#/dictionary', id: 'dictionary', wait: `!!document.querySelector('#view a.card, #view .panel, #view section')` },
  { hash: '#/review', id: 'review', wait: `(document.getElementById('view')?.innerText||'').length > 20` },
];
const CHECK_NAMES = [
  '1: no horizontal scroll',
  '2: touch targets ≥ 44px',
  '3: exactly one aria-current, right section',
  '4: no storage/.json/undefined/NaN/null text',
  '5: contrast ≥ 4.5:1',
  '6: header ≤ 64px @375',
  '7: next-steps inside first 812px',
  '8: button text not wrapped',
];
// Сводка: check → [total, fails]
const totals = CHECK_NAMES.map(() => [0, 0]);
let passes = 0, failures = 0;

/** Проверка: строка PASS/FAIL + счётчики. culprit — селектор виновника. */
function check(num, route, ok, culprit) {
  totals[num - 1][0]++;
  if (ok) { passes++; log(`PASS [p${num}] ${route}`); }
  else {
    failures++;
    totals[num - 1][1]++;
    log(`FAIL [p${num}] ${route} — ${culprit}`);
  }
}

/** Дождаться, пока view отрисован (предикат) и settled (250 ms на анимации). */
async function settled(waitExpr) {
  const deadline = Date.now() + 15000;
  for (;;) {
    const v = await evaluate(waitExpr).catch(() => false);
    if (v === true) break;
    if (Date.now() > deadline) break;
    await sleep(250);
  }
  await sleep(250);
}

/* ---- 8 проверок; каждая возвращает null (ok) или строку-виновника ---- */
function checkExprs() {
  return {
    // 1. горизонтальный скролл по определению из задания:
    //    documentElement.scrollWidth <= innerWidth (±1 px — округление border'ов)
    1: `(() => {
      const d = document.documentElement;
      if (d.scrollWidth <= window.innerWidth + 1) return null;
      // виновник: правый край элемента, заходящий за clientWidth
      let worst = null, worstD = 0;
      for (const e of document.body.querySelectorAll('*')) {
        const r = e.getBoundingClientRect();
        const over = r.right - d.clientWidth;
        if (over > worstD) { worstD = over; worst = e; }
      }
      const sel = worst ? (worst.id ? '#' + worst.id : worst.tagName.toLowerCase() + (worst.className ? '.' + String(worst.className).split(' ')[0] : '')) : 'documentElement';
      return sel + ' (right=' + Math.round(worstD) + 'px, scrollWidth=' + d.scrollWidth + ', innerWidth=' + d.innerWidth + ')';
    })()`,
    // 2. видимые кнопки/ссылки ≥ 44×44; ссылки «внутри текста» (inline) — мимо
    2: `(() => {
      const small = [];
      for (const e of document.querySelectorAll('button, a')) {
        const r = e.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (getComputedStyle(e).display === 'none') continue;
        if (e.tagName === 'A' && !['block', 'inline-block'].includes(getComputedStyle(e).display)) continue;
        if (r.width < 44 || r.height < 44) {
          const s = e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (e.className ? '.' + String(e.className).split(' ')[0] : '');
          small.push(s + '@' + Math.round(r.width) + 'x' + Math.round(r.height));
        }
      }
      return small.length ? small.slice(0, 5).join(', ') : null;
    })()`,
    // 4. вредный текст
    4: `(() => {
      const t = document.body.innerText || '';
      for (const bad of ['storage/', '.json', 'undefined', 'NaN', 'null']) {
        if (t.includes(bad)) return 'text "' + bad + '"';
      }
      return null;
    })()`,
    // 6. шапка ≤ 64 px
    6: `(() => {
      const h = document.querySelector('header.masthead, header');
      if (!h) return null;
      const hgt = h.getBoundingClientRect().height;
      return hgt > 64 ? 'header@' + Math.round(hgt) + 'px' : null;
    })()`,
    // 7. #dashboard-next-steps (id) целиком в первых 812 px
    7: `(() => {
      const b = document.getElementById('dashboard-next-steps');
      if (!b) return '#dashboard-next-steps отсутствует';
      const bottom = b.getBoundingClientRect().bottom;
      return bottom > 812 ? '#dashboard-next-steps bottom=' + Math.round(bottom) + 'px' : null;
    })()`,
    // 8. кнопки не перенесены: height ≤ 1.6*line-height + paddingTop + paddingBottom
    8: `(() => {
      const wrapped = [];
      for (const b of document.querySelectorAll('#view button, header button, nav button')) {
        if (!b.innerText.trim()) continue;
        const cs = getComputedStyle(b);
        if (cs.display === 'none') continue;
        const maxH = 1.6 * parseFloat(cs.lineHeight) + parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
        const r = b.getBoundingClientRect();
        if (r.height > maxH + 1) wrapped.push((b.id ? '#' + b.id : 'button') + '.' + String(b.className).split(' ')[0] + '@' + Math.round(r.height) + 'px');
      }
      return wrapped.length ? wrapped.slice(0, 5).join(', ') : null;
    })()`,
  };
}

/** 5. контраст: все «листовые» текстовые элементы, background — до первого непрозрачного. */
async function contrastCulprit() {
  const bad = await evaluate(`(() => {
    const parse = (s) => {
      const m = String(s).match(/rgba?\\(([^)]+)\\)/);
      if (!m) return null;
      const p = m[1].split(',').map((x) => parseFloat(x));
      return p.length >= 4 ? [p[0], p[1], p[2], p[3]] : [p[0], p[1], p[2], 1];
    };
    const lum = (c) => {
      const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
    };
    const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
    const effectiveBg = (e) => {
      let n = e;
      while (n && n !== document.documentElement) {
        const c = parse(getComputedStyle(n).backgroundColor);
        if (c && c[3] >= 0.99) return c;
        n = n.parentElement;
      }
      return [255, 255, 255, 1];
    };
    const isLeaf = (e) => {
      if (!e.childElementCount) return !!(e.textContent || '').trim();
      for (const c of e.children) {
        const d = getComputedStyle(c).display;
        if (d === 'block' || d === 'flex' || d === 'grid' || d === 'list-item') return false;
      }
      return !!(e.textContent || '').trim();
    };
    const bad = [];
    let seen = 0;
    for (const e of document.body.querySelectorAll('body *')) {
      if (!isLeaf(e)) continue;
      const r = e.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (getComputedStyle(e).display === 'none' || getComputedStyle(e).visibility === 'hidden') continue;
      const fg = parse(getComputedStyle(e).color);
      if (!fg) continue;
      seen++;
      const rt = ratio(fg, effectiveBg(e));
      if (rt < 4.5 && bad.length < 5) {
        const s = e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (e.className ? '.' + String(e.className).split(' ')[0] : '');
        bad.push(s + '@' + rt.toFixed(2) + ':1');
      }
    }
    return { bad, seen };
  })()`);
  return bad.bad.length ? bad.bad.join(', ') : null;
}

/** 3. ровно один aria-current в нижнем меню и он соответствует разделу. */
async function navCulprit(route) {
  const info = await evaluate(`(() => {
    const nav = document.getElementById('nav');
    if (!nav || getComputedStyle(nav).display === 'none') return { shown: false };
    const items = Array.from(nav.querySelectorAll('a'));
    const cur = items.filter((a) => a.hasAttribute('aria-current'));
    return { shown: true, n: items.length, cur: cur.map((a) => (a.dataset.route || '?') + ':' + (a.getAttribute('aria-label') || a.innerText.trim()).slice(0, 20)) };
  })()`);
  if (!info.shown) return null; // онбординг: меню скрыто — проверка не применима
  if (info.cur.length !== 1) return `aria-current items: ${info.cur.length} ${JSON.stringify(info.cur)}`;
  // карта разделов → пункт нижнего меню (data-route), по задаче S2.1 п.3
  const expected = {
    dashboard: 'dashboard', stats: 'dashboard', records: 'dashboard',
    practice: 'practice', review: 'practice', search: 'practice',
    mistakes: 'mistakes',
    theory: 'theory', dictionary: 'theory',
    exam: 'exam', settings: 'settings',
  }[route.id] || null;
  if (expected && info.cur[0].split(':')[0] !== expected) {
    return `cur=${info.cur[0]} но раздел «${route.id}» → ${expected}`;
  }
  return null;
}

async function checkRoute(route, vp) {
  const tag = `${route.hash} @${vp.w}`;
  await evaluate(`location.hash = ${JSON.stringify(route.hash)}`);
  await settled(route.wait);
  await sleep(150);

  const exprs = checkExprs();
  for (const num of [1, 2, 4, 6, 8]) {
    if (num === 6 && vp.w !== 375) { check(6, tag, true, null); continue; } // п.6 — только на 375
    const culprit = await evaluate(exprs[num]);
    check(num, tag, culprit === null, culprit || 'ok');
  }
  check(3, tag, (await navCulprit(route)) === null, (await navCulprit(route)) || 'ok');
  check(5, tag, (await contrastCulprit()) === null, (await contrastCulprit()) || 'ok');
  // п.7 — только для дашборда новичка (на 1280 тоже меряем: 812 — высота вьюпорта задания)
  if (route.id === 'dashboard') {
    const c7 = await evaluate(checkExprs()[7]);
    check(7, tag, c7 === null, c7 || 'ok');
  } else {
    check(7, tag, true, null);
  }
}

async function checkOnboarding(vp) {
  const tag = `onboarding @${vp.w}`;
  // Онбординг рисуется только при onboarded=false. СВОЖУ профиль в
  // onboarded=true (иначе приложение не «запомнит» имя — свежий профиль
  // хранится у пользователя в localStorage и переживает DELETE), затем
  // сбрасываю через API: приложение с прогрессом + reset = онбординг.
  const prog = await (await fetch(`${APP}/api/progress`)).json();
  await fetch(`${APP}/api/progress`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...prog, profile: { ...prog.profile, onboarded: true, name: 'QA' } }),
  });
  await fetch(`${APP}/api/progress`, { method: 'DELETE' });
  // Полная перезагрузка: в памяти у вкладки ещё старый профиль с
  // onboarded=true, и location.hash='#/' нарисует дашборд, а не онбординг.
  await evaluate(`location.href = ${JSON.stringify(`${APP}/`)}`);
  await settled(`!!document.getElementById('ob-name')`);
  const exprs = checkExprs();
  for (const num of [1, 2, 4, 6, 8]) {
    if (num === 6 && vp.w !== 375) { check(6, tag, true, null); continue; }
    const culprit = await evaluate(exprs[num]);
    check(num, tag, culprit === null, culprit || 'ok');
  }
  const nav3 = await navCulprit({ id: 'dashboard' });
  check(3, tag, nav3 === null, nav3 || 'nav на онбординге (скрыт — проверка не применима)');
  check(5, tag, (await contrastCulprit()) === null, (await contrastCulprit()) || 'ok');
  check(7, tag, true, null);
}

/** Пройти онбординг кликами (как в qa-new-user.mjs) — только на 1-м вьюпорте. */
async function completeOnboarding() {
  // Дождаться загрузки приложения: route() асинхронный (ждёт api.progress()),
  // сразу после connectTab вьюпа ещё пустой.
  await settled(`document.readyState === 'complete'`);
  await settled(`!!document.getElementById('ob-name') || (document.getElementById('view')?.innerHTML||'').length > 0`);
  await settled(`!!document.getElementById('ob-name')`);
  if (!(await evaluate(`!!document.getElementById('ob-name')`))) {
    const dump = await evaluate(`JSON.stringify({hash:location.hash, title:document.title, readyState:document.readyState, len:(document.getElementById('view')?.innerHTML||'').length, text:(document.getElementById('view')?.innerText||'').slice(0,120), hasMainFn:typeof window.appReady, bodyHtmlLen:(document.body?document.body.innerHTML.length:-1)})`).catch(e=> 'eval err '+e);
    throw new Error('онбординг не отрисовался (ob-name отсутствует). ДИАГ: ' + dump);
  }
  await evaluate(`(() => { const i = document.getElementById('ob-name'); i.value='QA'; i.dispatchEvent(new Event('input',{bubbles:true})); return true; })()`);
  const click = (label) => evaluate(`(() => { const b = Array.from(document.querySelectorAll('#view button, #view a')).find((x) => (x.innerText || '').includes(${JSON.stringify(label)})); b && b.click(); return true; })()`);
  await click('CONTINUE');
  await settled(`(document.getElementById('view')?.innerText||'').toUpperCase().includes('HOW YOU WILL STUDY')`);
  await click('CONTINUE');
  await settled(`(document.getElementById('view')?.innerText||'').toUpperCase().includes('YOUR PROGRESS NEVER LEAVES HERE')`);
  await click('START LEARNING');
  await settled(`(document.getElementById('view')?.innerText||'').includes('CIAO, QA')`);
}

let chrome = null;
async function main() {
  chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=9333`, `--user-data-dir=${path.join(TEMP, 'chrome')}`,
    '--no-first-run', '--no-default-browser-check', '--disable-features=Translate', 'about:blank',
  ], { stdio: 'ignore' });

  for (const vp of VIEWPORTS) {
    await connectTab(`${APP}/`);
    await send('Emulation.setDeviceMetricsOverride', {
      width: vp.w, height: vp.h, deviceScaleFactor: 2, mobile: vp.w < 500,
    });
    await evaluate(`document.fonts ? document.fonts.ready.then(1) : 1`);
    if (vp.w === VIEWPORTS[0].w) {
      // первый запуск — чистый профиль: маршруты без онбординга рендерят
      // онбординг, поэтому сначала кликаемся через него
      await completeOnboarding();
    }
    for (const route of ROUTES) await checkRoute(route, vp);
    // онбординг — последним: сбрасывает профиль (DELETE), остальные маршруты — с прогрессом
    await checkOnboarding(vp);
    ws.close();
    ws = null;
  }

  log('СВОДКА (baseline): FAIL по каждой проверке (10 маршрутов + онбординг, 2 вьюпорта):');
  totals.forEach(([total, fails], i) => {
    log(`  p${i + 1} ${CHECK_NAMES[i]}: ${fails}/${total} FAIL`);
  });
  log(`ИТОГО: ${passes} PASS, ${failures} FAIL`);
  chrome.kill('SIGKILL');
}

try {
  await main();
  process.exitCode = 0;
} catch (err) {
  console.error(`[ux] ОШИБКА: ${err.stack || err.message}`);
  process.exitCode = 1;
} finally {
  try { ws && ws.close(); } catch { /* ignore */ }
  try { chrome && chrome.kill('SIGKILL'); } catch { /* ignore */ }
  try { ownServer.kill('SIGTERM'); } catch { /* ignore */ }
  await sleep(400);
  try { fs.rmSync(TEMP, { recursive: true, force: true }); } catch { /* ignore */ }
  console.log(`[ux] chrome/сервер остановлены, ${TEMP} убран`);
}

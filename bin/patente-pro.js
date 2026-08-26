#!/usr/bin/env node
/**
 * Desktop launcher: starts the local server, then opens the app in a
 * chromeless browser window so it behaves like an installed application.
 *
 * Zero dependencies by design (see docs/TODO.md, Phase 3) — everything
 * here uses only Node built-ins and what the OS already ships.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  APP_NAME,
  HELP_TEXT,
  appModeArgs,
  appModeBrowser,
  findFreePort,
  osOpenCommand,
  parseArgs,
  userDataDir,
  waitForServer,
} from './launcher-lib.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let opts;
try {
  opts = parseArgs(process.argv.slice(2));
} catch (err) {
  console.error(`${err.message}\n\n${HELP_TEXT}`);
  process.exit(2);
}

if (opts.help) {
  console.log(HELP_TEXT);
  process.exit(0);
}

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
if (opts.version) {
  console.log(`${APP_NAME} ${pkg.version}`);
  process.exit(0);
}

// Progress lives in the per-user data directory, never inside the app
// folder, so reinstalling or updating cannot lose it.
const dataDir = userDataDir({ platform: process.platform, env: process.env, home: os.homedir() });
fs.mkdirSync(dataDir, { recursive: true });

// One-time migration for people who ran `npm start` in a checkout first.
const legacyProgress = path.join(ROOT, 'storage', 'progress.json');
const installedProgress = path.join(dataDir, 'progress.json');
if (!fs.existsSync(installedProgress) && fs.existsSync(legacyProgress)) {
  fs.copyFileSync(legacyProgress, installedProgress);
  console.log(`Imported existing progress from ${legacyProgress}`);
}

const port = await findFreePort(opts.port, opts.host);
const url = `http://${opts.host}:${port}`;

process.env.PORT = String(port);
process.env.HOST = opts.host;
process.env.STORAGE_DIR = dataDir;

// Importing starts the server (it binds on import and installs its own
// SIGINT/SIGTERM handlers that flush pending writes before exiting).
await import(new URL('../server/index.js', import.meta.url));

console.log(`
  ${APP_NAME} ${pkg.version}
  ${url}
  Progress: ${installedProgress}
  Press Ctrl+C to quit.
`);

async function openWindow() {
  if (!(await waitForServer(url))) {
    console.error('Server did not become ready in time; open the URL manually.');
    return;
  }
  const browser = appModeBrowser({ platform: process.platform, env: process.env, exists: fs.existsSync });
  const child = browser
    ? spawn(browser, appModeArgs(url, path.join(dataDir, 'browser-profile')), {
        detached: true,
        stdio: 'ignore',
      })
    : (() => {
        const { command, args } = osOpenCommand(process.platform);
        return spawn(command, [...args, url], { detached: true, stdio: 'ignore' });
      })();
  child.on('error', () => {
    console.error(`Could not open a window automatically — visit ${url}`);
  });
  child.unref();
}

if (opts.open) openWindow();

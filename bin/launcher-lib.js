/**
 * Pure helpers for the desktop launcher (bin/patente-pro.js).
 *
 * Kept dependency-free and side-effect-free so they can be unit tested:
 * filesystem and process access is injected by the caller.
 */

import net from 'node:net';
import path from 'node:path';

export const APP_NAME = 'Passo';
export const DEFAULT_PORT = 3000;

export function parseArgs(argv) {
  const opts = { port: DEFAULT_PORT, host: '127.0.0.1', open: true, help: false, version: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') opts.help = true;
    else if (arg === '--version' || arg === '-v') opts.version = true;
    else if (arg === '--no-open') opts.open = false;
    else if (arg === '--port' || arg === '-p') {
      const value = Number.parseInt(argv[++i], 10);
      if (!Number.isInteger(value) || value < 1 || value > 65535) {
        throw new Error(`Invalid --port value: ${argv[i]}`);
      }
      opts.port = value;
    } else if (arg.startsWith('--port=')) {
      const value = Number.parseInt(arg.slice(7), 10);
      if (!Number.isInteger(value) || value < 1 || value > 65535) {
        throw new Error(`Invalid --port value: ${arg.slice(7)}`);
      }
      opts.port = value;
    } else if (arg === '--host') {
      opts.host = argv[++i];
      if (!opts.host) throw new Error('--host needs a value');
    } else if (arg.startsWith('--host=')) {
      opts.host = arg.slice(7);
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  return opts;
}

/**
 * Where the user's progress file lives once the app is installed. Kept
 * outside the application directory so reinstalling or upgrading can
 * never touch study progress. Honours an explicit STORAGE_DIR.
 */
export function userDataDir({ platform, env = {}, home }) {
  if (env.STORAGE_DIR) return env.STORAGE_DIR;
  if (platform === 'win32') {
    return path.join(env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'PatentePro');
  }
  if (platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', 'PatentePro');
  }
  return path.join(env.XDG_DATA_HOME || path.join(home, '.local', 'share'), 'patente-pro');
}

/**
 * A Chromium-family binary can show the app in a chromeless window
 * (--app=URL), which is what makes this feel like a native application
 * rather than a browser tab. Returns null when none is installed; the
 * caller then falls back to the OS default browser.
 */
export function appModeBrowser({ platform, env = {}, exists }) {
  const candidates = [];
  if (platform === 'darwin') {
    candidates.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
    );
  } else if (platform === 'win32') {
    const roots = [
      env['PROGRAMFILES'] || 'C:\\Program Files',
      env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)',
      env['LOCALAPPDATA'] || '',
    ].filter(Boolean);
    for (const root of roots) {
      candidates.push(
        path.join(root, 'Google', 'Chrome', 'Application', 'chrome.exe'),
        path.join(root, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
        path.join(root, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
      );
    }
  } else {
    candidates.push(
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/usr/bin/microsoft-edge',
      '/usr/bin/brave-browser',
      '/snap/bin/chromium',
    );
  }
  return candidates.find((candidate) => exists(candidate)) ?? null;
}

/** Command that hands a URL to the OS default browser. */
export function osOpenCommand(platform) {
  if (platform === 'darwin') return { command: 'open', args: [] };
  if (platform === 'win32') return { command: 'cmd', args: ['/c', 'start', ''] };
  return { command: 'xdg-open', args: [] };
}

/** Window-mode flags: chromeless window sized like an app, own profile dir. */
export function appModeArgs(url, profileDir) {
  return [`--app=${url}`, `--user-data-dir=${profileDir}`, '--window-size=1180,880'];
}

/** True when something is already listening on host:port. */
export function probePort(port, host) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host });
    const done = (inUse) => {
      socket.destroy();
      resolve(inUse);
    };
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
    socket.setTimeout(400, () => done(false));
  });
}

/**
 * First free port at or after `start`. A local app should never fail
 * because something else grabbed 3000.
 */
export async function findFreePort(start, host, attempts = 20) {
  for (let port = start; port < start + attempts; port++) {
    if (!(await probePort(port, host))) return port;
  }
  throw new Error(`No free port found in range ${start}-${start + attempts - 1}`);
}

/** Polls the health endpoint until the server answers. */
export async function waitForServer(url, { timeoutMs = 15000, intervalMs = 120, fetchImpl = fetch } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const res = await fetchImpl(`${url}/api/health`);
      if (res.ok) return true;
    } catch {
      /* not up yet */
    }
    if (Date.now() > deadline) return false;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

export const HELP_TEXT = `${APP_NAME} — Italian driving theory trainer

USAGE
  patente-pro [options]

OPTIONS
  -p, --port <n>   Port to listen on (default ${DEFAULT_PORT}; the next
                   free port is used automatically if it is taken)
      --host <h>   Interface to bind (default 127.0.0.1)
      --no-open    Do not open a window, just run the server
  -v, --version    Print version
  -h, --help       Show this help

Progress is stored per user, outside the app directory, so upgrading
never touches it. Override with the STORAGE_DIR environment variable.
`;

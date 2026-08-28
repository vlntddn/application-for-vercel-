import { test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  appModeArgs,
  appModeBrowser,
  findFreePort,
  osOpenCommand,
  parseArgs,
  probePort,
  userDataDir,
  waitForServer,
} from '../bin/launcher-lib.js';
import { pngToIco, pngSize } from '../scripts/make-ico.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('parseArgs defaults and flags', () => {
  const d = parseArgs([]);
  assert.equal(d.port, 3000);
  assert.equal(d.host, '127.0.0.1');
  assert.equal(d.open, true);

  assert.equal(parseArgs(['--port', '8080']).port, 8080);
  assert.equal(parseArgs(['--port=8080']).port, 8080);
  assert.equal(parseArgs(['-p', '1234']).port, 1234);
  assert.equal(parseArgs(['--no-open']).open, false);
  assert.equal(parseArgs(['--host', '0.0.0.0']).host, '0.0.0.0');
  assert.equal(parseArgs(['--help']).help, true);
  assert.equal(parseArgs(['-v']).version, true);
});

test('parseArgs rejects bad input', () => {
  assert.throws(() => parseArgs(['--port', 'abc']), /Invalid --port/);
  assert.throws(() => parseArgs(['--port', '70000']), /Invalid --port/);
  assert.throws(() => parseArgs(['--nope']), /Unknown option/);
  assert.throws(() => parseArgs(['--host']), /--host needs a value/);
});

test('userDataDir keeps progress out of the app folder, per platform', () => {
  assert.equal(
    userDataDir({ platform: 'win32', env: { APPDATA: 'C:\\Users\\v\\AppData\\Roaming' }, home: 'C:\\Users\\v' }),
    path.join('C:\\Users\\v\\AppData\\Roaming', 'PatentePro'),
  );
  assert.equal(
    userDataDir({ platform: 'darwin', env: {}, home: '/Users/v' }),
    '/Users/v/Library/Application Support/PatentePro',
  );
  assert.equal(
    userDataDir({ platform: 'linux', env: {}, home: '/home/v' }),
    '/home/v/.local/share/patente-pro',
  );
  assert.equal(
    userDataDir({ platform: 'linux', env: { XDG_DATA_HOME: '/data' }, home: '/home/v' }),
    '/data/patente-pro',
  );
  // An explicit STORAGE_DIR always wins (used by tests and power users).
  assert.equal(
    userDataDir({ platform: 'linux', env: { STORAGE_DIR: '/tmp/x' }, home: '/home/v' }),
    '/tmp/x',
  );
});

test('appModeBrowser picks an installed Chromium-family browser', () => {
  const mac = appModeBrowser({
    platform: 'darwin',
    exists: (p) => p.includes('Google Chrome'),
  });
  assert.match(mac, /Google Chrome$/);

  const linux = appModeBrowser({
    platform: 'linux',
    exists: (p) => p === '/usr/bin/chromium',
  });
  assert.equal(linux, '/usr/bin/chromium');

  const win = appModeBrowser({
    platform: 'win32',
    env: { PROGRAMFILES: 'C:\\Program Files' },
    exists: (p) => p.endsWith('msedge.exe'),
  });
  assert.match(win, /msedge\.exe$/);

  // No browser found: caller falls back to the OS opener.
  assert.equal(appModeBrowser({ platform: 'linux', exists: () => false }), null);
});

test('osOpenCommand per platform', () => {
  assert.deepEqual(osOpenCommand('darwin'), { command: 'open', args: [] });
  assert.deepEqual(osOpenCommand('linux'), { command: 'xdg-open', args: [] });
  assert.deepEqual(osOpenCommand('win32'), { command: 'cmd', args: ['/c', 'start', ''] });
});

test('appModeArgs asks for a chromeless window with its own profile', () => {
  const args = appModeArgs('http://127.0.0.1:3000', '/data/profile');
  assert.ok(args.includes('--app=http://127.0.0.1:3000'));
  assert.ok(args.includes('--user-data-dir=/data/profile'));
});

test('probePort and findFreePort detect a taken port', async () => {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const taken = server.address().port;

  assert.equal(await probePort(taken, '127.0.0.1'), true);
  // findFreePort must skip the busy port rather than fail.
  const free = await findFreePort(taken, '127.0.0.1', 10);
  assert.notEqual(free, taken);
  assert.equal(await probePort(free, '127.0.0.1'), false);

  await new Promise((resolve) => server.close(resolve));
});

test('waitForServer gives up instead of hanging forever', async () => {
  const ok = await waitForServer('http://127.0.0.1:1', {
    timeoutMs: 60,
    intervalMs: 10,
    fetchImpl: () => Promise.reject(new Error('refused')),
  });
  assert.equal(ok, false);
});

test('waitForServer resolves once health responds', async () => {
  let calls = 0;
  const ok = await waitForServer('http://x', {
    intervalMs: 1,
    fetchImpl: async () => {
      calls += 1;
      if (calls < 3) throw new Error('not yet');
      return { ok: true };
    },
  });
  assert.equal(ok, true);
  assert.equal(calls, 3);
});

test('pngToIco wraps the shipped 256px icon into a valid container', () => {
  const png = fs.readFileSync(path.join(ROOT, 'public', 'icons', 'icon-256.png'));
  assert.deepEqual(pngSize(png), { width: 256, height: 256 });

  const ico = pngToIco(png);
  assert.equal(ico.readUInt16LE(0), 0); // reserved
  assert.equal(ico.readUInt16LE(2), 1); // type: icon
  assert.equal(ico.readUInt16LE(4), 1); // image count
  assert.equal(ico.readUInt8(6), 0); // 256 is encoded as 0
  assert.equal(ico.readUInt32LE(14), png.length);
  assert.equal(ico.readUInt32LE(18), 22); // data offset
  assert.ok(ico.subarray(22).equals(png));
  assert.throws(() => pngToIco(Buffer.from('not a png')), /Not a PNG/);
});

test('launcher and installers are shipped and executable', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.equal(pkg.bin['patente-pro'], 'bin/patente-pro.js');
  for (const file of ['install.sh', 'uninstall.sh', 'install.ps1', 'uninstall.ps1']) {
    assert.ok(fs.existsSync(path.join(ROOT, file)), `${file} missing`);
  }
  // npx runs the bin directly, so the shebang and exec bit must be right.
  const launcher = path.join(ROOT, 'bin', 'patente-pro.js');
  assert.match(fs.readFileSync(launcher, 'utf8').split('\n')[0], /^#!\/usr\/bin\/env node$/);
  assert.ok(fs.statSync(launcher).mode & 0o111, 'launcher must be executable');
  assert.ok(fs.statSync(path.join(ROOT, 'install.sh')).mode & 0o111, 'install.sh must be executable');
});

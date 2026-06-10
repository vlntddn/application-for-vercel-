import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

import { config } from './config.js';
import { JsonStore } from './store.js';
import { ProgressService, ValidationError, EMPTY_PROGRESS } from './progress.js';
import { sendJson, sendError, readJsonBody } from './http-helpers.js';
import { serveFile } from './static.js';

const store = new JsonStore(path.join(config.storageDir, 'progress.json'), EMPTY_PROGRESS).load();
const progress = new ProgressService(store);

// The question manifest doubles as a slug whitelist for /api/questions/:slug.
const manifest = JSON.parse(fs.readFileSync(path.join(config.dataDir, 'manifest.json'), 'utf8'));
const validSlugs = new Set(manifest.categories.map((c) => c.slug));

const QUESTIONS_RE = /^\/api\/questions\/([a-z0-9-]+)$/;

async function handleApi(req, res, pathname) {
  if (req.method === 'GET') {
    if (pathname === '/api/health') {
      return sendJson(res, 200, { status: 'ok', uptime: process.uptime() });
    }
    if (pathname === '/api/manifest') {
      return sendJson(res, 200, manifest, { 'Cache-Control': 'max-age=3600' });
    }
    if (pathname === '/api/theory') {
      return serveFile(res, config.dataDir, '/theory.json', { cache: 'max-age=3600' });
    }
    const qMatch = pathname.match(QUESTIONS_RE);
    if (qMatch) {
      if (!validSlugs.has(qMatch[1])) return sendError(res, 404, 'Unknown category');
      return serveFile(res, config.dataDir, `/questions/${qMatch[1]}.json`, { cache: 'max-age=3600' });
    }
    if (pathname === '/api/progress') {
      return sendJson(res, 200, progress.snapshot());
    }
    return sendError(res, 404, 'Not found');
  }

  if (req.method === 'PUT' && pathname === '/api/progress/profile') {
    const body = await readJsonBody(req, config.maxBodyBytes);
    return sendJson(res, 200, { profile: await progress.updateProfile(body) });
  }
  if (req.method === 'POST' && pathname === '/api/progress/answers') {
    const body = await readJsonBody(req, config.maxBodyBytes);
    return sendJson(res, 200, await progress.recordAnswers(body));
  }
  if (req.method === 'POST' && pathname === '/api/progress/exams') {
    const body = await readJsonBody(req, config.maxBodyBytes);
    return sendJson(res, 201, { exam: await progress.recordExam(body) });
  }
  if (req.method === 'POST' && pathname === '/api/progress/theory') {
    const body = await readJsonBody(req, config.maxBodyBytes);
    return sendJson(res, 200, await progress.markTheoryRead(body));
  }
  if (req.method === 'DELETE' && pathname === '/api/progress') {
    return sendJson(res, 200, await progress.reset());
  }

  return sendError(res, 405, 'Method not allowed');
}

const server = http.createServer(async (req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    return sendError(res, 400, 'Bad request');
  }
  try {
    if (pathname.startsWith('/api/')) {
      await handleApi(req, res, pathname);
    } else if (req.method === 'GET' || req.method === 'HEAD') {
      await serveFile(res, config.publicDir, pathname === '/' ? '/index.html' : pathname);
    } else {
      sendError(res, 405, 'Method not allowed');
    }
  } catch (err) {
    if (err instanceof ValidationError) {
      sendError(res, 422, err.message);
    } else if (err.status) {
      sendError(res, err.status, err.message);
    } else {
      console.error(err);
      if (!res.headersSent) sendError(res, 500, 'Internal server error');
    }
  }
});

server.listen(config.port, config.host, () => {
  const { address, port } = server.address();
  console.log(`PATENTE PRO running at http://${address}:${port}`);
  console.log(`Progress file: ${path.join(config.storageDir, 'progress.json')}`);
});

async function shutdown(signal) {
  console.log(`\n${signal} received, shutting down...`);
  server.close();
  await store.flush();
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

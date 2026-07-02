import fsp from 'node:fs/promises';
import path from 'node:path';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
};

/**
 * Serves files from a directory. Resolves the requested path and refuses
 * anything that escapes the directory (path traversal protection).
 */
export async function serveFile(res, baseDir, pathname, { cache = 'no-cache' } = {}) {
  const filePath = path.resolve(baseDir, `.${pathname}`);
  if (filePath !== baseDir && !filePath.startsWith(baseDir + path.sep)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  let content;
  try {
    content = await fsp.readFile(filePath);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
    return;
  }

  res.writeHead(200, {
    'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream',
    'Content-Length': content.length,
    'Cache-Control': cache,
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(content);
}

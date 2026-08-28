export function sendJson(res, status, payload, headers = {}) {
  const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(body);
}

export function sendError(res, status, message) {
  sendJson(res, status, { error: message });
}

/** Reads and parses a JSON request body, enforcing a size limit. */
export function readJsonBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        // Stop buffering, but drain the rest instead of destroying the
        // socket: destroying it here would kill the connection before the
        // 413 could be written, leaving the client with a bare reset.
        chunks.length = 0;
        req.removeAllListeners('data');
        req.removeAllListeners('end');
        req.resume();
        reject(Object.assign(new Error('Request body too large'), { status: 413 }));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (size === 0) {
        reject(Object.assign(new Error('Request body is required'), { status: 400 }));
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(Object.assign(new Error('Request body must be valid JSON'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

/**
 * Cross-site protection for the local server (SEC1, audit V1/V2).
 *
 * The server listens on localhost, but any web page the user visits can
 * still send requests to it. Three checks close that door:
 *  - Host must be this machine (defeats DNS rebinding: evil.example
 *    resolving to 127.0.0.1 still sends `Host: evil.example`) → 421;
 *  - a mutation carrying Origin must come from the app itself → 403;
 *  - a mutation with a body must be application/json, which a foreign
 *    page cannot send without a CORS preflight we never answer → 415.
 * No CORS headers are ever sent, so preflighted requests fail too.
 */

const LOOPBACK_NAMES = ['127.0.0.1', 'localhost', '[::1]'];
const WILDCARD_HOSTS = new Set(['0.0.0.0', '::', '']);
const MUTATIONS = new Set(['POST', 'PUT', 'DELETE', 'PATCH']);

/** Host header values accepted for a server bound to `bindHost` on `port`. */
export function allowedHosts(bindHost, port) {
  const names = new Set(LOOPBACK_NAMES);
  // Bound to a specific LAN address (HOST=192.168.1.5): accept that too.
  if (bindHost && !WILDCARD_HOSTS.has(bindHost)) {
    names.add(bindHost.includes(':') && !bindHost.startsWith('[') ? `[${bindHost}]` : bindHost);
  }
  return new Set([...names].map((name) => `${name}:${port}`.toLowerCase()));
}

/**
 * Returns null when the request may proceed, otherwise { status, message }.
 * `hosts` is the Set from allowedHosts().
 */
export function checkRequest({ method, headers }, hosts) {
  const host = String(headers.host || '').toLowerCase();
  if (!hosts.has(host)) {
    return { status: 421, message: 'Unknown host' };
  }
  if (!MUTATIONS.has(method)) return null;

  const origin = headers.origin;
  if (origin !== undefined && String(origin).toLowerCase() !== `http://${host}`) {
    return { status: 403, message: 'Cross-origin request refused' };
  }
  if (method !== 'DELETE') {
    const type = String(headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    if (type !== 'application/json') {
      return { status: 415, message: 'Content-Type must be application/json' };
    }
  }
  return null;
}

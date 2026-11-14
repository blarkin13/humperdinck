// Runs only for pages under /r/<computer>/. The studio was written for its
// own origin root, so its requests for /api/..., /assets/... and audio files
// are sent to the same paths on the chosen computer instead.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

const PREFIX = /^\/r\/([a-z0-9]{16,40})(?=\/)/;
const known = new Map();

async function computerFor(event) {
  const id = event.clientId || event.resultingClientId;
  if (known.has(id)) return known.get(id);
  const client = id ? await self.clients.get(id) : null;
  const match = client && new URL(client.url).pathname.match(PREFIX);
  const computer = match ? match[1] : null;
  if (computer && id) known.set(id, computer);
  return computer;
}

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || PREFIX.test(url.pathname) || url.pathname === '/r/sw.js') return;
  event.respondWith((async () => {
    const computer = await computerFor(event);
    if (!computer) return fetch(event.request);
    const target = '/r/' + computer + url.pathname + url.search;
    const request = event.request;
    const body = ['GET', 'HEAD'].includes(request.method) ? undefined : await request.blob();
    return fetch(target, {method: request.method, headers: request.headers, body,
      credentials: 'same-origin', redirect: 'follow', cache: 'no-store'});
  })());
});

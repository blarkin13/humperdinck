// Studio relay: lets a signed-in person use the Humperdinck desktop app running
// on their own computer from any browser, without codes, router changes or
// extra apps.
//
// - The desktop app (desktop session bearer token) keeps one outbound
//   WebSocket open to /api/relay/host.
// - The person's browser (web session cookie) opens /connect/, picks a computer
//   and loads /r/<computer>/..., which this Worker forwards over that socket.
// - One Durable Object per account, so one account can never reach another
//   account's computers. Requests and responses are framed as JSON heads plus
//   binary chunks so audio uploads and downloads stream in pieces.

const CHUNK = 256 * 1024;
const MAX_BODY = 200 * 1024 * 1024;
const REQUEST_TIMEOUT = 120_000;
const ID = /^[a-z0-9]{16,40}$/;
const enc = new TextEncoder();
const dec = new TextDecoder();

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store'}
});

const HOP = new Set(['connection', 'keep-alive', 'transfer-encoding', 'upgrade', 'host', 'cookie',
  'authorization', 'cf-connecting-ip', 'cf-ipcountry', 'cf-ray', 'cf-visitor', 'x-forwarded-for',
  'x-forwarded-proto', 'x-real-ip', 'content-length', 'origin', 'referer']);

// Binary frame: 4-byte big-endian request number, 1-byte kind, payload.
// kind 1 = body chunk, 2 = end of body.
function frame(number, kind, bytes = new Uint8Array()) {
  const out = new Uint8Array(5 + bytes.byteLength);
  new DataView(out.buffer).setUint32(0, number);
  out[4] = kind;
  out.set(bytes, 5);
  return out;
}

export async function handleRelay(request, env, {session}) {
  const url = new URL(request.url);
  if (!env.STUDIO_RELAY) return json({error: 'Remote studio is not available yet'}, 503);
  const user = await session(request, env);

  if (url.pathname === '/api/relay/host') {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return json({error: 'WebSocket required'}, 426);
    if (!user || user.kind !== 'desktop') return json({error: 'Connect this computer to your account first'}, 401);
    const computer = url.searchParams.get('computer') || '';
    if (!ID.test(computer)) return json({error: 'Invalid computer id'}, 400);
    const name = (url.searchParams.get('name') || 'Computer').replace(/[^\p{L}\p{N} ._'()-]/gu, '').slice(0, 60) || 'Computer';
    return stub(env, user.id).fetch('https://relay/host?computer=' + computer + '&name=' + encodeURIComponent(name), request);
  }

  if (url.pathname === '/api/relay/computers') {
    if (!user || user.kind !== 'web') return json({error: 'Sign in to see your computers', signed_in: false}, 401);
    return stub(env, user.id).fetch('https://relay/computers');
  }

  if (url.pathname === '/r/sw.js') {
    const asset = await env.ASSETS.fetch(new Request(new URL('/connect/relay-sw.js', url), request));
    const headers = new Headers(asset.headers);
    headers.set('Service-Worker-Allowed', '/');
    headers.set('Cache-Control', 'no-cache');
    return new Response(asset.body, {status: asset.status, headers});
  }

  const match = url.pathname.match(/^\/r\/([a-z0-9]{16,40})(\/.*)?$/);
  if (!match) return json({error: 'Not found'}, 404);
  if (!user || user.kind !== 'web') {
    if (request.headers.get('Accept')?.includes('text/html'))
      return Response.redirect(url.origin + '/connect/', 302);
    return json({error: 'Sign in to use your studio'}, 401);
  }
  if (!match[2]) return Response.redirect(url.origin + '/r/' + match[1] + '/', 302);
  const length = Number(request.headers.get('Content-Length') || 0);
  if (length > MAX_BODY) return json({error: 'Upload too large for remote use'}, 413);
  const forward = new Request('https://relay/forward/' + match[1] + match[2] + url.search, request);
  return stub(env, user.id).fetch(forward);
}

function stub(env, userId) {
  return env.STUDIO_RELAY.get(env.STUDIO_RELAY.idFromName('user:' + userId));
}

export class StudioRelay {
  constructor(state) {
    this.state = state;
    this.pending = new Map();
    this.counter = 0;
  }

  hosts() {
    const result = new Map();
    for (const socket of this.state.getWebSockets()) {
      const info = socket.deserializeAttachment();
      if (info?.computer) result.set(info.computer, {socket, ...info});
    }
    return result;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/host') {
      const computer = url.searchParams.get('computer');
      for (const [id, host] of this.hosts())
        if (id === computer) try { host.socket.close(4000, 'Replaced by a newer connection'); } catch {}
      const [client, server] = Object.values(new WebSocketPair());
      this.state.acceptWebSocket(server, [computer]);
      server.serializeAttachment({computer, name: url.searchParams.get('name'), since: Date.now()});
      return new Response(null, {status: 101, webSocket: client});
    }
    if (url.pathname === '/computers') {
      const computers = [...this.hosts().values()].map(h => ({id: h.computer, name: h.name, online_since: h.since}));
      return json({signed_in: true, computers});
    }
    const match = url.pathname.match(/^\/forward\/([a-z0-9]+)(\/.*)$/);
    if (!match) return json({error: 'Not found'}, 404);
    const host = this.hosts().get(match[1]);
    if (!host) return json({error: 'That computer is offline. Open Humperdinck on it and turn on “Use on other devices”.'}, 503);
    return this.forward(host.socket, request, match[2] + url.search);
  }

  async forward(socket, request, path) {
    const number = (this.counter = (this.counter + 1) % 0xffffffff);
    const headers = {};
    for (const [key, value] of request.headers) if (!HOP.has(key.toLowerCase())) headers[key] = value;
    let resolveHead, rejectHead;
    const head = new Promise((resolve, reject) => { resolveHead = resolve; rejectHead = reject; });
    const {readable, writable} = new TransformStream();
    const entry = {resolveHead, rejectHead, writer: writable.getWriter(), started: false};
    this.pending.set(number, entry);
    const timer = setTimeout(() => this.fail(number, 'The computer took too long to answer'), REQUEST_TIMEOUT);
    entry.timer = timer;
    try {
      socket.send(JSON.stringify({type: 'request', id: number, method: request.method, path, headers}));
      if (request.body) {
        const reader = request.body.getReader();
        for (;;) {
          const {done, value} = await reader.read();
          if (done) break;
          for (let i = 0; i < value.byteLength; i += CHUNK) socket.send(frame(number, 1, value.subarray(i, i + CHUNK)));
        }
      }
      socket.send(frame(number, 2));
    } catch {
      this.fail(number, 'Lost the connection to the computer');
    }
    let response;
    try { response = await head; } catch (error) { return json({error: error.message}, 502); }
    const out = new Headers();
    for (const [key, value] of Object.entries(response.headers || {}))
      if (!HOP.has(key.toLowerCase()) && key.toLowerCase() !== 'set-cookie') out.set(key, value);
    out.set('Cache-Control', out.get('Cache-Control') || 'no-store');
    out.set('X-Robots-Tag', 'noindex');
    const nullBody = [101, 204, 205, 304].includes(response.status) || request.method === 'HEAD';
    if (nullBody) readable.cancel().catch(() => {});
    return new Response(nullBody ? null : readable, {status: response.status, headers: out});
  }

  fail(number, message) {
    const entry = this.pending.get(number);
    if (!entry) return;
    this.pending.delete(number);
    clearTimeout(entry.timer);
    if (!entry.started) entry.rejectHead(new Error(message));
    else entry.writer.abort(new Error(message)).catch(() => {});
  }

  webSocketMessage(socket, message) {
    if (typeof message === 'string') {
      let data;
      try { data = JSON.parse(message); } catch { return; }
      if (data.type === 'ping') return socket.send(JSON.stringify({type: 'pong'}));
      const entry = this.pending.get(data.id);
      if (!entry) return;
      if (data.type === 'response') {
        entry.started = true;
        clearTimeout(entry.timer);
        entry.timer = setTimeout(() => this.fail(data.id, 'The computer stopped sending'), REQUEST_TIMEOUT);
        entry.resolveHead({status: data.status, headers: data.headers});
      } else if (data.type === 'error') {
        this.fail(data.id, data.message || 'The computer could not answer');
      }
      return;
    }
    const bytes = new Uint8Array(message);
    if (bytes.byteLength < 5) return;
    const number = new DataView(bytes.buffer, bytes.byteOffset).getUint32(0);
    const entry = this.pending.get(number);
    if (!entry) return;
    if (bytes[4] === 1) {
      clearTimeout(entry.timer);
      entry.timer = setTimeout(() => this.fail(number, 'The computer stopped sending'), REQUEST_TIMEOUT);
      entry.writer.write(bytes.slice(5)).catch(() => this.fail(number, 'Browser went away'));
    } else if (bytes[4] === 2) {
      clearTimeout(entry.timer);
      this.pending.delete(number);
      entry.writer.close().catch(() => {});
    }
  }

  webSocketClose(socket) { this.dropSocket(socket); }
  webSocketError(socket) { this.dropSocket(socket); }

  dropSocket(socket) {
    // Requests in flight on a closed socket can never finish.
    if (this.state.getWebSockets().length === 0)
      for (const number of [...this.pending.keys()]) this.fail(number, 'The computer disconnected');
    try { socket.close(1011, 'closed'); } catch {}
  }
}

export const _test = {frame, HOP, ID, dec, enc};

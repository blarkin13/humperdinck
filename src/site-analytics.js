// Privacy-conscious aggregate event logging. No IPs, user agents, cookies, or text content.
const TYPES = new Set(['page_view', 'download_click', 'download_served']);
const PLATFORMS = new Set(['website', 'studio', 'windows', 'macos', 'linux']);
const SOURCES = new Set(['homepage', 'github', 'r2', 'other']);

export function recordAnalyticsEvent(env, type, platform, source) {
  if (!env.ANALYTICS || !TYPES.has(type) || !PLATFORMS.has(platform) || !SOURCES.has(source)) return;
  try {
    env.ANALYTICS.writeDataPoint({
      blobs: [type, platform, source],
      doubles: [1],
      indexes: [type + ':' + platform]
    });
  } catch {
    // Analytics must never prevent site browsing or file delivery.
  }
}

export async function handleAnalyticsEvent(request, env) {
  if (request.method !== 'POST') return new Response('Method not allowed', {status: 405, headers: {'Allow':'POST'}});
  const origin = request.headers.get('Origin');
  const url = new URL(request.url);
  if (origin !== url.origin) return new Response('Forbidden', {status:403});
  if (!(request.headers.get('Content-Type') || '').toLowerCase().startsWith('application/json'))
    return new Response('Unsupported media type', {status:415});
  if (Number(request.headers.get('Content-Length') || 0) > 512) return new Response('Payload too large', {status:413});
  let event;
  try {
    const raw = await request.text();
    if (raw.length > 512) return new Response('Payload too large', {status:413});
    event = JSON.parse(raw);
  } catch {
    return new Response('Invalid JSON', {status:400});
  }
  if (!event || !TYPES.has(event.type) || !PLATFORMS.has(event.platform) || !SOURCES.has(event.source)) {
    return new Response('Invalid event', {status:400});
  }
  // A browser can report visits or clicks, but not successful installer delivery.
  if (event.type === 'download_served') return new Response('Forbidden', {status:403});
  if (event.type === 'page_view' && !['website','studio'].includes(event.platform)) return new Response('Invalid event', {status:400});
  if (event.type === 'download_click' && !['windows','macos','linux'].includes(event.platform)) return new Response('Invalid event', {status:400});
  recordAnalyticsEvent(env, event.type, event.platform, event.source);
  return new Response(null, {status:204, headers:{'Cache-Control':'no-store'}});
}

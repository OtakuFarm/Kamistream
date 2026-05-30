/* ═══════════════════════════════════════════════════
 * KamiStream Service Worker v2
 * - Caches app shell for instant loads
 * - Does NOT block our own ad domains
 * - Passes through all external API/embed traffic
 * ═══════════════════════════════════════════════════ */
const CACHE     = 'kamistream-v2';
const SHELL     = ['/', '/index.html', '/ads.js', '/manifest.json'];

// Only block third-party embed player ad injections
// NOT our own Monetag domains (omg10.com, nap5k.com)
const EMBED_AD_BLOCKLIST = [
  'exoclick.com',
  'trafficjunky.com',
  'juicyads.com',
  'popcash.net',
  'popads.net',
  'adcash.com',
  'hilltopads.net',
];

function isEmbedAdRequest(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    // Only block from within iframes (referrer check not reliable in SW)
    // So we only block known embed-injected domains, not our own
    return EMBED_AD_BLOCKLIST.some(d => host === d || host.endsWith('.' + d));
  } catch { return false; }
}

function isPassThrough(url) {
  // Always pass through: our ad network, APIs, embeds, fonts
  const pass = [
    'omg10.com',         // Monetag popunder — OUR ads
    'nap5k.com',         // Monetag in-page push — OUR ads
    'ipapi.co',          // geo detection
    'jikan.moe',
    'anilist.co',
    'myanimelist.net',
    'supabase.co',
    'googleapis.com',
    'megaplay.buzz',
    'anikotoapi.site',
    'graphql.anilist.co',
    'fonts.gstatic.com',
  ];
  try {
    const host = new URL(url).hostname.toLowerCase();
    return pass.some(d => host === d || host.endsWith('.' + d));
  } catch { return false; }
}

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(SHELL))
      .catch(() => {}) // don't fail install if shell cache misses
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = req.url;

  // Only handle GET requests
  if (req.method !== 'GET') return;

  // Always pass through — never cache or intercept
  if (isPassThrough(url)) return;

  // Block known embed player ad injections
  if (isEmbedAdRequest(url)) {
    e.respondWith(new Response('', { status: 200 }));
    return;
  }

  // Navigate requests (HTML pages): network first, fall back to index.html (SPA)
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Static assets (JS/CSS/fonts/images): cache first
  if (url.includes('/assets/') || url.match(/\.(js|css|woff2?|png|svg|jpg|webp|ico)(\?|$)/)) {
    e.respondWith(
      caches.match(req).then(cached => {
        if (cached) return cached;
        return fetch(req).then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then(c => c.put(req, clone)).catch(() => {});
          }
          return res;
        }).catch(() => cached || new Response('', { status: 408 }));
      })
    );
    return;
  }

  // Everything else: network only (API calls, dynamic content)
});

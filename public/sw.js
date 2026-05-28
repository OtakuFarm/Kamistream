const CACHE = 'kamistream-v1';
const SHELL = ['/', '/index.html'];

// Known ad/tracker domains to block from embed players
const AD_BLOCKLIST = [
  'omg10.com',
  'nap5k.com',
  'ipapi.co',
  'exoclick.com',
  'trafficjunky.com',
  'juicyads.com',
  'adskeeper.com',
  'adsterra.com',
  'propellerads.com',
  'popcash.net',
  'popads.net',
  'adcash.com',
  'hilltopads.net',
  'traffichunt.com',
  'pushground.com',
  'richpush.co',
  'evadav.com',
  'bidvertiser.com',
  'revcontent.com',
  'mgid.com',
  'valueimpression.com',
  'zeropark.com',
  'clickadu.com',
  'admaven.com',
];

function isAdRequest(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return AD_BLOCKLIST.some(domain => host === domain || host.endsWith('.' + domain));
  } catch {
    return false;
  }
}

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = e.request.url;

  // Block ad network requests — return empty 200 so player doesn't error
  if (isAdRequest(url)) {
    e.respondWith(new Response('', { status: 200 }));
    return;
  }

  // Pass through API/data calls
  if (url.includes('/api/') || url.includes('supabase') || url.includes('jikan') || url.includes('anilist')) {
    return;
  }

  // Cache first for everything else
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});

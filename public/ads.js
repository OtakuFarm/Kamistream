/* ════════════════════════════════════════════════════════════════════════
 * KamiStream — Ads Manager (v16 — revenue optimization)
 * ────────────────────────────────────────────────────────────────────────
 * Design principle: every ad format runs the way its network actually
 * intends it to run. No custom click-cooldown reinvention, no reinjecting
 * scripts on a timer, no guessed URLs. Only zones with a confirmed real
 * tag are wired in.
 *
 * POPUNDER   — auto-attach scripts (Monetag x4 + Adsterra x1). Each
 *              network's own SDK listens for clicks and decides when to
 *              fire, on its own terms. We inject exactly ONE of these
 *              per session (rotating which one), and never touch it again.
 *              This is how every major site running these networks does
 *              it — the network's script IS the whole integration.
 *
 * IN-PAGE PUSH (Monetag) — one zone per slot (home/player/sidebar/detail).
 *              Loads only once its container scrolls into view.
 *
 * VIGNETTE (Monetag) — ONE confirmed zone (11482506). Fires on episode
 *              navigation with a simple cooldown. The other 3 zones from
 *              this format were never confirmed with a real tag, so
 *              they're left out rather than guessed at.
 *
 * NATIVE BANNER (Adsterra) — container-div + invoke.js. Loads on visible.
 *
 * PUSH NOTIFICATIONS — not handled here at all; needs its own service
 *              worker, see public/sw.js.
 * ════════════════════════════════════════════════════════════════════════ */

(function(global) {
  'use strict';

  if (global.KamiAds) return; // don't double-init

  /* ── Host / environment gating ────────────────────────────────────── */
  var PROD_HOSTS = [
    'kamistream.tv',  'www.kamistream.tv',
    'kamistream.fun', 'www.kamistream.fun',
    'kamistream.com', 'www.kamistream.com'
  ];
  function _isProd() {
    try {
      var h = location.hostname.toLowerCase();
      for (var i = 0; i < PROD_HOSTS.length; i++) if (h === PROD_HOSTS[i]) return true;
      return false;
    } catch(e) { return false; }
  }
  function _isAdmin() {
    try { return location.pathname.indexOf('/admin') === 0; } catch(e) { return false; }
  }
  function _disabled() {
    return !!global.__KAMI_ADS_DISABLE || _isAdmin() || !_isProd();
  }
  function _log() {
    try { if (global.__KAMI_ADS_DEBUG) console.log.apply(console, arguments); } catch(e) {}
  }
  function _now() { return Date.now(); }

  /* ── Popunder zones ────────────────────────────────────────────────
   * Monetag zones need `zone` (rendered as data-zone). Adsterra's tag is
   * self-contained — no zone attribute needed.
   * `weight` controls selection odds (revenue weighting per network). */
  var POP_ZONES = [
    { network: 'monetag',  zone: '11482508', src: 'https://quge5.com/88/tag.min.js', weight: 3 },
    { network: 'monetag',  zone: '10944552', src: 'https://al5sm.com/tag.min.js', weight: 2 },
    { network: 'monetag',  zone: '10937465', src: 'https://quge5.com/88/tag.min.js', weight: 2 },
    { network: 'monetag',  zone: '10936606', src: 'https://al5sm.com/tag.min.js', weight: 2 },
    { network: 'adsterra', src: 'https://pl30707075.effectivecpmnetwork.com/0a/5d/1f/0a5d1f029a04ceee852996a15e2a9c3d.js', weight: 2 }
  ];

  function _pickWeightedZone() {
    var total = 0, i;
    for (i = 0; i < POP_ZONES.length; i++) total += POP_ZONES[i].weight || 1;
    var r = Math.random() * total;
    for (i = 0; i < POP_ZONES.length; i++) {
      r -= (POP_ZONES[i].weight || 1);
      if (r <= 0) return POP_ZONES[i];
    }
    return POP_ZONES[POP_ZONES.length - 1];
  }

  /* ── In-Page Push zones (Monetag) — one per slot ─────────────────── */
  var INPAGE = {
    'home-ad':    { zone: '10937463', src: 'https://nap5k.com/tag.min.js' },
    'player-ad':  { zone: '10937466', src: 'https://nap5k.com/tag.min.js' },
    'sidebar-ad': { zone: '11482502', src: 'https://nap5k.com/tag.min.js' },
    'detail-ad':  { zone: '11482509', src: 'https://nap5k.com/tag.min.js' }
  };

  /* ── Vignette (Monetag) — only the one confirmed zone ────────────── */
  var VIGNETTE_ZONE = '11482506';
  var VIGNETTE_SRC  = 'https://n6wxm.com/vignette.min.js';
  var VIGNETTE_COOLDOWN_MS = 90 * 1000; // one per 90s max, on episode nav

  /* ── Native Banner (Adsterra) ─────────────────────────────────────
   * Container ID is fixed by Adsterra's script — do not rename it. */
  var NATIVE_BANNERS = {
    'anime-native': {
      containerId: 'container-246d201d05be7eb163a939228e4f4e1c',
      src: 'https://pl30707076.effectivecpmnetwork.com/246d201d05be7eb163a939228e4f4e1c/invoke.js'
    }
  };

  /* ── Banner Ads (Adsterra) — fixed IAB sizes ──────────────────────
   * Each one loads inside its own isolated iframe so multiple banners
   * on one page never collide over the shared `atOptions` global.
   * Slot names are per-PLACEMENT, not per-size — this is a client-side
   * routed SPA, so if two pages used the same slot name, navigating
   * between them wouldn't reload the banner (load-state persists across
   * client-side navigation). Multiple slots can point at the same key. */
  var BANNER_ADS = {
    'banner-300x250-watch':  { key: '33f656e4eb706c118cd29e59fb42d89e', width: 300, height: 250 },
    'banner-300x250-detail': { key: '33f656e4eb706c118cd29e59fb42d89e', width: 300, height: 250 },
    'banner-160x300': { key: '93fe8f6e7be4014c54c0e9edd076c2e3', width: 160, height: 300 },
    'banner-160x600': { key: '604a240aa6accfc7ddc075f09a2734c5', width: 160, height: 600 },
    'banner-468x60':  { key: '2efa0d631e82cb9801c076bf077253b0', width: 468, height: 60  }
  };

  /* ── State ─────────────────────────────────────────────────────── */
  var _s = {
    armed:            false,
    popArmed:         false,
    popInjected:      false,
    popListenersArmed: false,
    popFallbackTimer: 0,
    lastVignette:     0,
    vignetteCount:    0,
    inpageLoaded:     {},
    nativeLoaded:     {},
    bannerLoaded:     {}
  };

  /* ── Popunder: inject exactly one script, once, ever, per session ──
   * Injected on FIRST USER INTERACTION (click/touch/scroll/key), with a
   * short fallback timer so passive users still see it. Interaction-gated
   * injection is how the networks prefer it: popunder tags need a user
   * gesture anyway, and engaging traffic scores higher with the networks'
   * quality algorithms. */
  var SESSION_POP_KEY = 'kami_pop_v15';
  var POP_FALLBACK_MS = 5 * 1000;

  function _initPopunder() {
    if (_disabled()) return;
    if (_s.popInjected) return;
    try {
      if (sessionStorage.getItem(SESSION_POP_KEY)) { _s.popInjected = true; return; }
    } catch(e) {}
    _s.popArmed = true;
    _log('[KamiAds] Popunder armed — waiting for first interaction');
  }

  function _injectPopunder() {
    if (_disabled() || _s.popInjected || !_s.popArmed) return;
    _s.popInjected = true;
    try { global.removeEventListener('pointerdown', _onFirstGesture, true); } catch(e) {}
    try { global.removeEventListener('keydown', _onFirstGesture, true); } catch(e) {}
    try { global.removeEventListener('scroll', _onFirstGesture, true); } catch(e) {}
    try { global.clearTimeout(_s.popFallbackTimer); } catch(e) {}
    try {
      var pick = _pickWeightedZone();
      var s = document.createElement('script');
      s.async = true;
      if (pick.zone) {
        s.dataset.zone = pick.zone;
        s.setAttribute('data-cfasync', 'false');
      }
      s.src = pick.src;
      (document.body || document.documentElement).appendChild(s);
      try { sessionStorage.setItem(SESSION_POP_KEY, '1'); } catch(e) {}
      _log('[KamiAds] Popunder injected:', pick.network, pick.zone || '(self-contained)');
    } catch(e) {}
  }

  function _onFirstGesture() { _injectPopunder(); }

  function _armPopListeners() {
    if (_disabled() || !_s.popArmed || _s.popListenersArmed) return;
    _s.popListenersArmed = true;
    try {
      global.addEventListener('pointerdown', _onFirstGesture, { capture: true, once: true, passive: true });
      global.addEventListener('keydown', _onFirstGesture, { capture: true, once: true });
      global.addEventListener('scroll', _onFirstGesture, { capture: true, once: true, passive: true });
    } catch(e) {
      try {
        global.addEventListener('pointerdown', _onFirstGesture, true);
        global.addEventListener('keydown', _onFirstGesture, true);
        global.addEventListener('scroll', _onFirstGesture, true);
      } catch(e2) {}
    }
    // Fallback: even fully passive users get the pop (networks decide when it fires).
    _s.popFallbackTimer = global.setTimeout(_injectPopunder, POP_FALLBACK_MS);
  }

  /* ── In-Page Push: load a slot once its container is visible ─────── */
  function _loadInPagePush(slotId) {
    if (_disabled()) return;
    if (_s.inpageLoaded[slotId]) return;
    var cfg = INPAGE[slotId];
    if (!cfg) { _log('[KamiAds] No in-page push config for slot:', slotId); return; }
    var el = document.getElementById(slotId);
    if (!el) return;

    var fire = function() {
      if (_s.inpageLoaded[slotId]) return;
      _s.inpageLoaded[slotId] = true;
      try {
        var s = document.createElement('script');
        s.async = true;
        s.dataset.zone = cfg.zone;
        s.setAttribute('data-cfasync', 'false');
        s.src = cfg.src;
        el.appendChild(s);
        _log('[KamiAds] In-page push loaded:', slotId, cfg.zone);
      } catch(e) {}
    };

    if ('IntersectionObserver' in global) {
      var io = new IntersectionObserver(function(entries) {
        for (var i = 0; i < entries.length; i++) {
          if (entries[i].isIntersecting) { io.disconnect(); fire(); break; }
        }
      }, { threshold: 0.1 });
      io.observe(el);
    } else {
      fire();
    }
  }

  /* ── Vignette: fire on episode navigation, simple cooldown ──────────
   * Cooldown persists across full page reloads via sessionStorage so
   * binge sessions (watch → detail → next episode) stay throttled while
   * still allowing one per episode-navigation window. */
  var SESSION_VIGN_KEY = 'kami_vign_v15';
  function _fireVignette() {
    if (_disabled()) return;
    var last = _s.lastVignette;
    try {
      var stored = parseInt(sessionStorage.getItem(SESSION_VIGN_KEY), 10);
      if (stored > last) last = stored;
    } catch(e) {}
    if ((_now() - last) < VIGNETTE_COOLDOWN_MS) return;
    try {
      var s = document.createElement('script');
      s.dataset.zone = VIGNETTE_ZONE;
      s.src = VIGNETTE_SRC;
      (document.body || document.documentElement).appendChild(s);
      _s.lastVignette = _now();
      _s.vignetteCount++;
      try { sessionStorage.setItem(SESSION_VIGN_KEY, String(_s.lastVignette)); } catch(e) {}
      _log('[KamiAds] Vignette fired:', VIGNETTE_ZONE);
    } catch(e) {}
  }

  /* ── Native Banner: load once its container is visible ───────────── */
  function _loadNativeBanner(slotName) {
    if (_disabled()) return;
    if (_s.nativeLoaded[slotName]) return;
    var cfg = NATIVE_BANNERS[slotName];
    if (!cfg) { _log('[KamiAds] No native banner config for slot:', slotName); return; }
    var el = document.getElementById(cfg.containerId);
    if (!el) return;

    var fire = function() {
      if (_s.nativeLoaded[slotName]) return;
      _s.nativeLoaded[slotName] = true;
      try {
        var s = document.createElement('script');
        s.async = true;
        s.setAttribute('data-cfasync', 'false');
        s.src = cfg.src;
        (document.body || document.documentElement).appendChild(s);
        _log('[KamiAds] Native banner loaded:', slotName);
      } catch(e) {}
    };

    if ('IntersectionObserver' in global) {
      var io = new IntersectionObserver(function(entries) {
        for (var i = 0; i < entries.length; i++) {
          if (entries[i].isIntersecting) { io.disconnect(); fire(); break; }
        }
      }, { threshold: 0.1 });
      io.observe(el);
    } else {
      fire();
    }
  }

  /* ── Banner Ads: load in an isolated iframe, avoids atOptions collision ─ */
  function _loadBannerAd(slotName) {
    if (_disabled()) return;
    if (_s.bannerLoaded[slotName]) return;
    var cfg = BANNER_ADS[slotName];
    if (!cfg) { _log('[KamiAds] No banner config for slot:', slotName); return; }
    var el = document.getElementById(slotName);
    if (!el) return;

    var fire = function() {
      if (_s.bannerLoaded[slotName]) return;
      _s.bannerLoaded[slotName] = true;
      try {
        var iframe = document.createElement('iframe');
        iframe.style.cssText = 'border:0;display:block;width:' + cfg.width + 'px;height:' + cfg.height + 'px;max-width:100%;';
        iframe.scrolling = 'no';
        iframe.setAttribute('frameborder', '0');
        el.appendChild(iframe);

        var doc = iframe.contentWindow && iframe.contentWindow.document;
        if (!doc) return;
        doc.open();
        doc.write(
          '<script>atOptions={"key":"' + cfg.key + '","format":"iframe","height":' + cfg.height +
          ',"width":' + cfg.width + ',"params":{}};</' + 'script>' +
          '<script src="https://www.highperformanceformat.com/' + cfg.key + '/invoke.js"></' + 'script>'
        );
        doc.close();
        _log('[KamiAds] Banner ad loaded:', slotName);
      } catch(e) {}
    };

    if ('IntersectionObserver' in global) {
      var io = new IntersectionObserver(function(entries) {
        for (var i = 0; i < entries.length; i++) {
          if (entries[i].isIntersecting) { io.disconnect(); fire(); break; }
        }
      }, { threshold: 0.1 });
      io.observe(el);
    } else {
      fire();
    }
  }

  /* ── Public API ────────────────────────────────────────────────── */
  // type: 'prev' | 'next' | 'list' | 'player' | 'server' — called from
  // watch.tsx on episode/server navigation
  function onEpisodeClick(type) {
    _fireVignette();
    _log('[KamiAds] onEpisodeClick:', type || 'unknown');
  }

  function initAds() {
    if (_disabled()) return;
    if (_s.armed) return;
    _s.armed = true;
    _initPopunder();
    _armPopListeners();
  }

  function _diag() {
    return {
      prod:         _isProd(),
      disabled:     _disabled(),
      popArmed:     _s.popArmed,
      popInjected:  _s.popInjected,
      vignetteCount: _s.vignetteCount,
      lastVignetteAgo: Math.round((_now() - _s.lastVignette) / 1000) + 's',
      inpageLoaded: Object.keys(_s.inpageLoaded),
      nativeLoaded: Object.keys(_s.nativeLoaded),
      bannerLoaded: Object.keys(_s.bannerLoaded)
    };
  }

  global.KamiAds = {
    init:              initAds,
    onEpisodeClick:    onEpisodeClick,
    onEpisodeChange:   onEpisodeClick, // alias — watch.tsx fires this on ep change
    loadInPagePush:    _loadInPagePush,
    loadNativeBanner:  _loadNativeBanner,
    loadBannerAd:      _loadBannerAd,
    showDebug:         function() { console.log('[KamiAds] Debug:', _diag()); return _diag(); }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAds);
  } else {
    initAds();
  }

})(window);

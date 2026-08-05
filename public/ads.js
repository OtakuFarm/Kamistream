/* ════════════════════════════════════════════════════════════════════════
 * KamiStream — Ads Manager (v14 — forced 10s click cadence, EXPERIMENTAL)
 * ────────────────────────────────────────────────────────────────────────
 * Popunder      zones : 11482508, 10944552, 10937465, 10936606
 *                        AUTO-ATTACH scripts (quge5.com / al5sm.com).
 *                        We re-inject a fresh script tag on every click,
 *                        gated by a 10s cooldown, no total cap. This
 *                        overrides Monetag's own internal firing cadence
 *                        by force — there's no documented API for this,
 *                        so behavior on repeated injection is unverified.
 *                        Watch Monetag's invalid-traffic flags closely
 *                        after deploying this.
 * In-Page Push  zones : one per slot — home/player/sidebar/detail
 * Vignette      zones : 11482510, 11482506, 10937467, 10936591 (rotating),
 *                        still manually triggered by us on episode nav
 * Push Notifications  : NOT wired here — see /public/sw.js notes
 * ════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  /* ── Zones ─────────────────────────────────────────────────────── */
  // OnClick (Popunder) — AUTO-ATTACH scripts across two companies. Each
  // one listens for clicks anywhere on the page and fires its own
  // popunder with its own internal frequency logic. We inject exactly
  // ONE of these per pageload (rotating), never multiple at once —
  // running two networks' popunder scripts simultaneously risks a
  // double-fire on the same click and violates most networks' terms.
  //
  // Monetag entries need a `zone` (rendered as data-zone on the tag).
  // Adsterra's tag is self-contained — the URL already encodes the zone,
  // so no zone/data-zone attribute is added for those entries.
  var POP_ZONES = [
    { network: 'monetag',  zone: '11482508', src: 'https://quge5.com/88/tag.min.js' },
    { network: 'monetag',  zone: '10944552', src: 'https://al5sm.com/tag.min.js' },
    { network: 'monetag',  zone: '10937465', src: 'https://quge5.com/88/tag.min.js' },
    { network: 'monetag',  zone: '10936606', src: 'https://al5sm.com/tag.min.js' },
    { network: 'adsterra', src: 'https://pl30707075.effectivecpmnetwork.com/0a/5d/1f/0a5d1f029a04ceee852996a15e2a9c3d.js' }
  ];

  // All 4 Vignette Banner zones — separate revenue stream from popunder,
  // its own trigger/cooldown below, also rotating across zones.
  var VIGNETTE_ZONES = ['11482510', '11482506', '10937467', '10936591'];
  var VIGNETTE_SRC   = 'https://n6wxm.com/vignette.min.js'; // confirmed for 11482506; verify others match
  var _vigIndex = 0;
  function _nextVignetteZone() {
    var z = VIGNETTE_ZONES[_vigIndex % VIGNETTE_ZONES.length];
    _vigIndex++;
    return z;
  }
  var _popIndex = 0;

  // Native Banner (Adsterra) — the script auto-detects its container div
  // by exact ID and renders into it. One slot for now: anime detail pages.
  var NATIVE_BANNERS = {
    'anime-native': {
      containerId: 'container-246d201d05be7eb163a939228e4f4e1c',
      src: 'https://pl30707076.effectivecpmnetwork.com/246d201d05be7eb163a939228e4f4e1c/invoke.js'
    }
  };

  // Real In-Page Push zones from your Monetag dashboard, one per slot —
  // no more shared-zone duplication across home/player/sidebar/detail.
  var INPAGE = {
    'home-ad':    { zone: '10937463', src: 'https://nap5k.com/tag.min.js' },
    'player-ad':  { zone: '10937466', src: 'https://nap5k.com/tag.min.js' },
    'sidebar-ad': { zone: '11482502', src: 'https://nap5k.com/tag.min.js' },
    'detail-ad':  { zone: '11482509', src: 'https://nap5k.com/tag.min.js' }
  };

  /* ── Production hosts ───────────────────────────────────────────── */
  var PROD_HOSTS = [
    'kamistream.tv',  'www.kamistream.tv',
    'kamistream.fun', 'www.kamistream.fun',
    'kamistream.com', 'www.kamistream.com'
  ];

  /* ── Timing constants ───────────────────────────────────────────── */
  // Vignette has its own independent cooldown so it lands as a genuinely
  // separate revenue moment from the auto-attach popunder
  var VIGNETTE_CD_T1      = 60 * 1000;
  var VIGNETTE_CD_T3      = 90 * 1000;

  // In-page push
  var INPAGE_EP_GAP_MS    = 45 * 1000;   // min gap between in-page reloads
  var INPAGE_SETTLE_MS    = 1000;         // delay after element visible
  var INPAGE_VIS_RATIO    = 0.2;
  var INPAGE_VIS_MS       = 1500;

  /* ── State ──────────────────────────────────────────────────────── */
  var _s = {
    armed:             false,
    lastVignette:      0,
    lastInpageEp:      0,
    inpageContainers:  {},
    geoTier:           null     // 'T1' | 'T3' | null (resolving)
  };

  /* ── Helpers ────────────────────────────────────────────────────── */
  function _isAdmin() { try { return /admin/i.test(location.pathname || ''); } catch(e) { return false; } }
  function _isProd() {
    try {
      var h = (location.hostname || '').toLowerCase();
      for (var i = 0; i < PROD_HOSTS.length; i++) if (h === PROD_HOSTS[i]) return true;
      return false;
    } catch(e) { return false; }
  }
  function _disabled() { return !!global.__KAMI_ADS_DISABLE || _isAdmin() || !_isProd(); }
  function _now()  { return Date.now(); }
  function _t1()   { return _s.geoTier === 'T1'; }
  function _log(m, x) { try { x !== undefined ? console.log(m, x) : console.log(m); } catch(e) {} }
  function _ssGet(k) { try { return sessionStorage.getItem(k); } catch(e) { return null; } }
  function _ssSet(k, v) { try { sessionStorage.setItem(k, v); } catch(e) {} }

  function _buildScript(zone, src) {
    var s = document.createElement('script');
    s.src = src; s.async = true; s.dataset.zone = zone;
    s.setAttribute('data-cfasync', 'false');
    return s;
  }

  /* ── Geo detection ──────────────────────────────────────────────── */
  var TIER1 = {US:1,GB:1,CA:1,AU:1,DE:1,FR:1,NL:1,SE:1,NO:1,DK:1,FI:1,CH:1,AT:1,BE:1,IE:1,NZ:1,SG:1,JP:1,KR:1};
  function _detectGeo() {
    var cached = _ssGet('kami_geo');
    if (cached) { _s.geoTier = cached; return; }
    try {
      fetch('https://ipapi.co/country/', { cache: 'force-cache' })
        .then(function(r) { return r.text(); })
        .then(function(c) {
          var t = TIER1[(c || '').trim().toUpperCase()] ? 'T1' : 'T3';
          _s.geoTier = t;
          _ssSet('kami_geo', t);
        })
        .catch(function() { _s.geoTier = 'T3'; });
    } catch(e) { _s.geoTier = 'T3'; }
  }

  /* ── Popunder: re-inject Monetag's auto-attach script on every click,
   * gated only by a 10s cooldown (no cap on total count). This is
   * EXPERIMENTAL — Monetag's script manages its own click detection and
   * firing internally, so we don't have a documented way to force its
   * cadence. Re-injecting a fresh <script> tag is the only lever we have;
   * it may fire cleanly, may no-op (some ad SDKs flag themselves as
   * already-loaded and skip re-init), or may stack listeners. Test this
   * carefully after deploying. */
  var POP_COOLDOWN_MS = 10 * 1000;
  var _lastPopInject  = 0;
  function _injectPopScript() {
    if (_disabled()) return;
    try {
      var pick = POP_ZONES[_popIndex % POP_ZONES.length];
      _popIndex++;
      var s;
      if (pick.zone) {
        s = _buildScript(pick.zone, pick.src);   // Monetag: adds data-zone
      } else {
        s = document.createElement('script');    // Adsterra: bare src, self-contained
        s.src = pick.src;
        s.async = true;
      }
      (document.body || document.documentElement).appendChild(s);
      _lastPopInject = _now();
      _log('[KamiAds] Popunder script (re)injected:', pick.network + (pick.zone ? ' / ' + pick.zone : ''));
    } catch(e) {}
  }
  function _armClickTrigger() {
    if (_disabled()) return;
    document.addEventListener('click', function() {
      if (_disabled()) return;
      if ((_now() - _lastPopInject) < POP_COOLDOWN_MS) return;
      _injectPopScript();
    }, { capture: true, passive: true });
  }

  /* ── Vignette Banner ───────────────────────────────────────────────
   * Self-appending overlay ad — separate demand source from popunder,
   * its own cooldown so it lands as its own revenue moment. Rotates
   * across all 4 vignette zones. */
  function _fireVignette() {
    if (_disabled()) return;
    try { if (document.visibilityState && document.visibilityState !== 'visible') return; } catch(e) {}
    try {
      var zone = _nextVignetteZone();
      var s = document.createElement('script');
      s.dataset.zone = zone;
      s.src = VIGNETTE_SRC;
      [document.documentElement, document.body].filter(Boolean).pop().appendChild(s);
      _s.lastVignette = _now();
      _log('[KamiAds] Vignette fired, zone:', zone);
    } catch(e) {}
  }

  function _tryVignette(trigger) {
    if (_disabled()) return;
    var cd = _t1() ? VIGNETTE_CD_T1 : VIGNETTE_CD_T3;
    if ((_now() - (_s.lastVignette || 0)) < cd) return;
    _fireVignette();
  }

  /* ── Trigger: episode navigation (called from React) ──────────────
   * Popunder no longer fires from here — Monetag's auto-attach script
   * already catches this click (and every other click on the page)
   * itself. We just handle the separate Vignette trigger here, since
   * that's still manually controlled by us. */
  // type: 'prev' | 'next' | 'list' | 'player' | 'server'
  function onEpisodeClick(type) {
    if (_disabled()) return;
    _tryVignette(type);
  }

  /* ── Trigger: episode change → reload in-page push ─────────────── */
  // Called on every malId/epId change in watch.tsx
  // Reloads the player-ad in-page push — passive revenue, never blocks UX
  function onEpisodeChange() {
    if (_disabled()) return;
    var now = _now();
    if ((now - _s.lastInpageEp) < INPAGE_EP_GAP_MS) return;
    _s.lastInpageEp = now;
    // Small delay so iframe settles first
    setTimeout(function() { _loadInPagePush('player-ad', true); }, 2000);
  }

  /* ── In-Page Push ───────────────────────────────────────────────── */
  function _loadInPagePush(containerId, force) {
    if (_disabled()) return;
    try {
      if (!containerId) return;
      if (!force && _s.inpageContainers[containerId]) return;
      var el = document.getElementById(containerId);
      if (!el) return;

      var cfg = INPAGE[containerId];
      if (!cfg || !cfg.zone || /^REPLACE_ME/.test(cfg.zone)) {
        _log('[KamiAds] No zone configured for slot:', containerId);
        return;
      }
      var vt = null;
      var fire = function() {
        try {
          el.innerHTML = '';
          el.appendChild(_buildScript(cfg.zone, cfg.src));
          _s.inpageContainers[containerId] = true;
        } catch(e) {}
      };
      var schedule = function() { setTimeout(fire, INPAGE_SETTLE_MS); };

      if ('IntersectionObserver' in global) {
        try {
          var io = new IntersectionObserver(function(entries) {
            for (var i = 0; i < entries.length; i++) {
              if (entries[i].isIntersecting && entries[i].intersectionRatio >= INPAGE_VIS_RATIO) {
                if (!vt) { vt = setTimeout(function() { io.disconnect(); schedule(); }, INPAGE_VIS_MS); }
              } else {
                if (vt) { clearTimeout(vt); vt = null; }
              }
            }
          }, { threshold: [0, INPAGE_VIS_RATIO, 1] });
          io.observe(el);
          return;
        } catch(e) {}
      }
      schedule();
    } catch(e) {}
  }

  /* ── Init all in-page slots on the current page ─────────────────── */
  function _initInPageSlots() {
    var slots = ['home-ad', 'player-ad', 'sidebar-ad', 'detail-ad'];
    for (var i = 0; i < slots.length; i++) {
      (function(id) {
        // Stagger loads so they don't hit the ad server simultaneously
        setTimeout(function() { _loadInPagePush(id); }, i * 800);
      })(slots[i]);
    }
  }

  /* ── Native Banner (Adsterra) ─────────────────────────────────────
   * The container div's ID is fixed by Adsterra's script — don't rename
   * it. Loads once the container is actually visible, same as in-page
   * push, so we're not paying for/serving impressions on offscreen slots. */
  var _nativeLoaded = {};
  function _loadNativeBanner(slotName) {
    if (_disabled()) return;
    try {
      var cfg = NATIVE_BANNERS[slotName];
      if (!cfg) { _log('[KamiAds] No native banner config for slot:', slotName); return; }
      if (_nativeLoaded[slotName]) return;
      var el = document.getElementById(cfg.containerId);
      if (!el) return; // container not in DOM yet

      var fire = function() {
        if (_nativeLoaded[slotName]) return;
        _nativeLoaded[slotName] = true;
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
    } catch(e) {}
  }

  /* ── Bootstrap ──────────────────────────────────────────────────── */
  function initAds() {
    if (_disabled()) return;
    if (_s.armed) return;
    _s.armed = true;

    _detectGeo();
    _armClickTrigger();     // re-injects popunder script on every click, 10s cooldown, no cap
    _initInPageSlots();     // load all visible in-page push slots
  }

  /* ── Diagnostics ────────────────────────────────────────────────── */
  function _diag() {
    var now = _now();
    return {
      prod:            _isProd(),
      disabled:        _disabled(),
      geoTier:         _s.geoTier,
      popInjected:     _popIndex > 0,
      popCooldownLeft: Math.max(0, POP_COOLDOWN_MS - (now - _lastPopInject)) + 'ms',
      lastVignetteAgo: Math.round((now - (_s.lastVignette || 0)) / 1000) + 's',
      inpageLoaded:    Object.keys(_s.inpageContainers)
    };
  }

  /* ── DOMContentLoaded bootstrap ─────────────────────────────────── */
  function _ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
    else fn();
  }
  _ready(function() { try { initAds(); } catch(e) {} });

  /* ── Public API (backward-compatible) ───────────────────────────── */
  global.KamiAds = {
    // Core
    onEpisodeClick:    onEpisodeClick,
    onEpisodeChange:   onEpisodeChange,
    loadInPagePush:    _loadInPagePush,
    loadNativeBanner:  _loadNativeBanner,

    // Slot loaders (called from React component refs)
    loadSidebarAd:     function() { _loadInPagePush('sidebar-ad'); },
    loadNativeAd:      function(id) { _loadInPagePush(id); },
    initInPagePush:    _initInPageSlots,

    // Legacy aliases
    initPopunderOnce:  initAds,
    initPopunder:      initAds,
    initOverlayAds:    initAds,
    applyOverlays:     function() {},
    initPush:          function() {},
    onSessionDepth:    function() {},
    maybeShowVignette: function() { return false; },
    reportPageview:    function() {},
    reportWatchSecond: function() {},
    disable:           function() { global.__KAMI_ADS_DISABLE = true; },

    // Debug
    showDebug: function() { try { console.log('[KamiAds]', _diag()); } catch(e) {} },

    // State / config (read-only)
    state:  _s,
    config: { inpagePush: INPAGE }
  };

})(window);

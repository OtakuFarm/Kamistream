/* ════════════════════════════════════════════════════════════════════════
 * KamiStream — Ads Manager (v12 — all zones, no daily cap)
 * ────────────────────────────────────────────────────────────────────────
 * Popunder      zones : 11482508, 10944552, 10937465, 10936606 (rotating)
 * In-Page Push  zones : one per slot — home/player/sidebar/detail
 * Vignette      zones : 11482510, 11482506, 10937467, 10936591 (rotating)
 * Push Notifications  : NOT wired here — needs a service worker + browser
 *                        permission prompt, separate integration
 *
 * Revenue strategy:
 *   · No daily cap — popunder + vignette fire on every trigger, subject
 *     only to per-trigger cooldowns (prevents literal double-fire, not a
 *     revenue limiter)
 *   · Popunder fires immediately on first pageload each session
 *   · Vignette is a fully separate trigger/cooldown from popunder — an
 *     additional revenue moment on episode navigation, not a duplicate
 *   · Zones rotate within each format for demand-source redundancy
 *   · In-page push reloads on every episode change (passive, non-blocking)
 *   · T1 users get tighter cooldowns (higher CPM, worth it)
 * ════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  /* ── Zones ─────────────────────────────────────────────────────── */
  // All 4 of your OnClick (Popunder) zones, rotating for redundancy —
  // if one demand source has no fill, the next zone in rotation still
  // gets a shot instead of showing nothing.
  var POP_URLS = [
    'https://omg10.com/4/11482508',
    'https://omg10.com/4/10944552',
    'https://omg10.com/4/10937465',
    'https://omg10.com/4/10936606'
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
  function _nextPopUrl() {
    var url = POP_URLS[_popIndex % POP_URLS.length];
    _popIndex++;
    return url;
  }

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
  // Global minimum between any two pops (hard floor — prevents accidental
  // double-fire from overlapping event handlers, not a monetization limiter)
  var GLOBAL_MIN_MS       = 5 * 1000;

  // Per-trigger cooldowns (T1 / T3)
  var CARD_CD_T1          = 3  * 60 * 1000;
  var CARD_CD_T3          = 4  * 60 * 1000;

  var EP_NAV_CD_T1        = 90 * 1000;
  var EP_NAV_CD_T3        = 120 * 1000;

  var SERVER_CD_T1        = 60 * 1000;
  var SERVER_CD_T3        = 90 * 1000;

  // Vignette has its own independent cooldown so it lands as a genuinely
  // separate revenue moment rather than stacking with the popunder
  var VIGNETTE_CD_T1      = 60 * 1000;
  var VIGNETTE_CD_T3      = 90 * 1000;

  // In-page push
  var INPAGE_EP_GAP_MS    = 45 * 1000;   // min gap between in-page reloads
  var INPAGE_SETTLE_MS    = 1000;         // delay after element visible
  var INPAGE_VIS_RATIO    = 0.2;
  var INPAGE_VIS_MS       = 1500;

  // Session pop: fire once per session on first meaningful navigation
  var SESSION_POP_KEY     = 'kami_sess_pop';

  /* ── Card selectors ─────────────────────────────────────────────── */
  // kami-card is the class on every AnimeCard component
  // Legacy selectors kept for any older markup
  var CARD_SELECTORS = [
    '.kami-card',
    '.tr-card','.cw-card','.bfv-card',
    '.rel-card','.ru-card','.pw-item','.wl-card'
  ].join(',');

  /* ── State ──────────────────────────────────────────────────────── */
  var _s = {
    armed:             false,
    cardObserver:      null,
    lastPopTime:       0,       // global last pop timestamp (in-memory)
    lastCardPop:       0,
    lastEpNavPop:      0,
    lastServerPop:     0,
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

  /* ── Core popunder ──────────────────────────────────────────────── */
  function _openPop() {
    // Don't pop into a backgrounded/inactive tab — that's a wasted call,
    // not revenue, so this check costs you nothing and isn't a "cap".
    try { if (document.visibilityState && document.visibilityState !== 'visible') return; } catch(e) {}
    try {
      var url = _nextPopUrl();
      var w = window.open(url, '_blank');
      if (w) { w.opener = null; }
      window.focus();
      _s.lastPopTime = _now();
      _log('[KamiAds] Pop fired:', url);
    } catch(e) {}
  }

  // Returns true if the global minimum gap has passed
  function _globalReady() {
    return (_now() - _s.lastPopTime) >= GLOBAL_MIN_MS;
  }

  /* ── Trigger: page load (once per session, fires immediately) ────── */
  function _tryPageloadPop() {
    if (_disabled()) return;
    if (_ssGet(SESSION_POP_KEY)) return; // already fired this session
    _ssSet(SESSION_POP_KEY, '1');
    setTimeout(function() {
      if (_disabled()) return;
      _openPop();
    }, 1500);
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
    if (!_globalReady()) return;
    var cd = _t1() ? VIGNETTE_CD_T1 : VIGNETTE_CD_T3;
    if ((_now() - (_s.lastVignette || 0)) < cd) return;
    _fireVignette();
  }

  /* ── Trigger: card click (home / browse / detail) ───────────────── */
  function _wrapCard(card) {
    if (card._kamiWrapped) return;
    card._kamiWrapped = true;
    card.addEventListener('click', function() {
      if (_disabled()) return;
      if (!_globalReady()) return;
      var cd = _t1() ? CARD_CD_T1 : CARD_CD_T3;
      if ((_now() - _s.lastCardPop) < cd) return;
      _s.lastCardPop = _now();
      _openPop();
    }, false);
  }

  function _applyToCards(root) {
    if (_disabled()) return;
    root = root || document;
    try {
      var cards = root.querySelectorAll(CARD_SELECTORS);
      for (var i = 0; i < cards.length; i++) _wrapCard(cards[i]);
    } catch(e) {}
  }

  function _watchCards() {
    if (_s.cardObserver) return;
    if (!('MutationObserver' in global)) return;
    var debounce = null;
    _s.cardObserver = new MutationObserver(function(mutations) {
      var hasNew = false;
      for (var i = 0; i < mutations.length; i++) {
        var nodes = mutations[i].addedNodes;
        for (var j = 0; j < nodes.length; j++) {
          var n = nodes[j];
          if (n.nodeType === 1) {
            if ((n.matches && n.matches(CARD_SELECTORS)) ||
                (n.querySelector && n.querySelector(CARD_SELECTORS))) {
              hasNew = true; break;
            }
          }
        }
        if (hasNew) break;
      }
      if (hasNew) {
        clearTimeout(debounce);
        debounce = setTimeout(function() { _applyToCards(); }, 120);
      }
    });
    _s.cardObserver.observe(document.body, { childList: true, subtree: true });
  }

  /* ── Trigger: episode navigation (called from React) ────────────── */
  // type: 'prev' | 'next' | 'list' | 'player' | 'server'
  function onEpisodeClick(type) {
    if (_disabled()) return;
    if (!_globalReady()) return;

    var cd;
    if (type === 'server') {
      cd = _t1() ? SERVER_CD_T1 : SERVER_CD_T3;
      if ((_now() - _s.lastServerPop) < cd) return;
      _s.lastServerPop = _now();
    } else {
      cd = _t1() ? EP_NAV_CD_T1 : EP_NAV_CD_T3;
      if ((_now() - _s.lastEpNavPop) < cd) return;
      _s.lastEpNavPop = _now();
    }

    _openPop();
    _log('[KamiAds] Episode click pop, type:', type || 'unknown');

    // Independent second trigger — different demand source, own cooldown,
    // so this is genuinely additional revenue rather than a duplicate call
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

  /* ── Bootstrap ──────────────────────────────────────────────────── */
  function initAds() {
    if (_disabled()) return;
    if (_s.armed) return;
    _s.armed = true;

    _detectGeo();
    _tryPageloadPop();      // fires once per session, shortly after load
    _applyToCards();        // wrap existing cards
    _watchCards();          // watch for React-rendered cards
    _initInPageSlots();     // load all visible in-page push slots
  }

  /* ── Diagnostics ────────────────────────────────────────────────── */
  function _diag() {
    var now = _now();
    return {
      prod:          _isProd(),
      disabled:      _disabled(),
      geoTier:       _s.geoTier,
      globalReady:   _globalReady(),
      lastPopAgo:    Math.round((now - _s.lastPopTime) / 1000) + 's',
      lastVignetteAgo: Math.round((now - (_s.lastVignette || 0)) / 1000) + 's',
      lastCardAgo:   Math.round((now - _s.lastCardPop) / 1000) + 's',
      lastEpNavAgo:  Math.round((now - _s.lastEpNavPop) / 1000) + 's',
      lastServerAgo: Math.round((now - _s.lastServerPop) / 1000) + 's',
      inpageLoaded:  Object.keys(_s.inpageContainers),
      sessionPop:    !!_ssGet(SESSION_POP_KEY)
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

/* ════════════════════════════════════════════════════════════════════════
 * KamiStream — Ads Manager (v4, clean + backward-compatible)
 * ────────────────────────────────────────────────────────────────────────
 * Two ad types only — Monetag Onclick (Popunder) + In-Page Push.
 * No service worker. No vignette. No multitag. No push notifications.
 *
 *   Popunder        zone 10936606   https://al5sm.com/tag.min.js
 *   In-Page Push    zone 10937463   https://nap5k.com/tag.min.js
 *
 * Highlights:
 *   • Production-only — silent on localhost / *.replit.dev / preview hosts.
 *   • Smart popunder — fires on any first click EXCEPT episode cards and
 *     the player iframe, so episode loading is never blocked by the ad script.
 *   • Deferred fire — popunder load wrapped in setTimeout so the user's own
 *     click handler runs first.
 *   • Lazy in-page push — each container waits until it scrolls ≥25% into
 *     view, then injects after a 1.2s settle delay.
 *   • Backward-compat shims — exposes the old v1 names (initInPagePush,
 *     reportPageview, loadNativeAd, injectFeedAd…) so existing HTML keeps
 *     working without edits.
 *   • Kill switch:  window.__KAMI_ADS_DISABLE = true   (or KamiAds.disable())
 *
 * Public API (window.KamiAds.*):
 *   initPopunderOnce()           — register one-time first-click loader
 *   loadInPagePush(containerId)  — inject in-page push into an element
 *   createFeedAdNode()           — return a DOM node for the feed loop
 *   disable()                    — kill switch
 *   _diag()                      — diagnostic snapshot
 * ════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var POPUNDER = { zone: '10936606', src: 'https://al5sm.com/tag.min.js' };
  var INPAGE   = { zone: '10937463', src: 'https://nap5k.com/tag.min.js' };

  /* Production hosts where ads are allowed. */
  var PROD_HOSTS = [
    'kamistream.tv',     'www.kamistream.tv',
    'kamistream.fun',    'www.kamistream.fun',
    'kamistream.com',    'www.kamistream.com'
  ];

  /* Click targets that must NOT trigger the popunder script load.
     Anything the user might click to *navigate* the app belongs here. */
  var SAFE_CLICK_SKIP = [
    'a', 'button', 'input', 'select', 'textarea', 'video', 'iframe', 'svg',
    '.tn', '.sb-item', '.mn-item',
    '.tr-card', '.ep-card', '.ep-source-pill',
    '.ap-btn-watch', '.ap-btn-watchlist', '.ap-src-btn', '.ap-now-btn',
    '.cf-action', '.cf-follow', '.cf-username',
    '.lb-item', '.tc-item', '.cw-card',
    '.rec-tab', '.view-all', '.adb-dismiss'
  ].join(',');

  var POPUNDER_DEFER_MS    = 250;     // run after user's own click handler
  var INPAGE_SETTLE_MS     = 1200;    // wait after slot scrolls into view
  var INPAGE_VISIBLE_RATIO = 0.25;    // inject when ≥25% of slot is visible

  var _state = {
    popunderArmed: false,
    popunderFired: false,
    inpageGlobalLoaded: false,
    inpageContainers: {}    /* containerId → true once injected */
  };

  function _isAdmin() {
    try { return /admin/i.test(location.pathname || ''); } catch (e) { return false; }
  }
  function _isProd() {
    try {
      var h = (location.hostname || '').toLowerCase();
      for (var i = 0; i < PROD_HOSTS.length; i++) if (h === PROD_HOSTS[i]) return true;
      return false;
    } catch (e) { return false; }
  }
  function _disabled() {
    return !!global.__KAMI_ADS_DISABLE || _isAdmin() || !_isProd();
  }
  function _log(msg, extra) {
    try { extra !== undefined ? console.log(msg, extra) : console.log(msg); } catch (e) {}
  }
  function _warn(msg, err) {
    try { console.warn('[KamiAds] ' + msg, err || ''); } catch (e) {}
  }

  function _buildZoneScript(zone, src) {
    var s = document.createElement('script');
    s.src   = src;
    s.async = true;
    s.dataset.zone = zone;
    s.setAttribute('data-cfasync', 'false');
    s.onerror = function () { _warn('script blocked or failed: ' + src); };
    return s;
  }

  /* Use closest() — handles SVG, text nodes, weird targets safely. */
  function _matchesSafeSkip(node) {
    try {
      if (!node) return false;
      /* SVG/text node click bubbles → use parentElement until we get an Element */
      while (node && node.nodeType !== 1) node = node.parentNode;
      if (!node) return false;
      if (node.matches && node.matches(SAFE_CLICK_SKIP)) return true;
      if (node.closest && node.closest(SAFE_CLICK_SKIP)) return true;
      return false;
    } catch (e) { return false; }
  }

  /* Episode-only skip list — the player resets the iframe at click time,
     so injecting the popunder script simultaneously breaks episode loading.
     Every other click (nav, cards, browse, hero…) still fires the popunder. */
  var EPISODE_SKIP = '.ep-card, .ep-source-pill, #apIframe, .ap-src-btn, .ap-now-btn';

  /* ── 1. Popunder (once per session, fires on any non-episode click) ── */
  function initPopunderOnce() {
    if (_disabled())   return;
    if (_state.popunderArmed) return;
    _state.popunderArmed = true;

    /* Use a plain boolean (false = bubble) so add and remove always match. */
    var _listenerOpts = false;

    var handler = function (ev) {
      if (_state.popunderFired) return;

      /* Skip only episode player interactions to avoid breaking iframe load */
      try {
        var node = ev.target;
        while (node && node.nodeType !== 1) node = node.parentNode;
        if (node && node.closest && node.closest(EPISODE_SKIP)) return;
      } catch (e) {}

      _state.popunderFired = true;
      try {
        document.removeEventListener('click',      handler, _listenerOpts);
        document.removeEventListener('touchstart', handler, _listenerOpts);
      } catch (e) {}

      setTimeout(function () {
        try {
          var s = _buildZoneScript(POPUNDER.zone, POPUNDER.src);
          document.body.appendChild(s);
          _log('Popunder loaded');
          /* Restore site interactivity immediately after script injection */
          setTimeout(function(){
            try{ if(typeof window.__kamiRestoreSite === 'function') window.__kamiRestoreSite(); }catch(e){}
          }, 300);
        } catch (e) { _warn('popunder inject failed', e); _state.popunderFired = false; }
      }, POPUNDER_DEFER_MS);
    };

    try {
      document.addEventListener('click',      handler, _listenerOpts);
      document.addEventListener('touchstart', handler, { passive: true, capture: false });
    } catch (e) {
      try { document.addEventListener('click', handler); } catch (_) {}
    }
  }

  /* ── 2. In-Page Push (renders inside an explicit container) ────────── */
  function loadInPagePush(containerId) {
    if (_disabled()) return;
    try {
      if (!containerId) return;
      var el = document.getElementById(containerId);
      if (!el) { _warn('container not found: ' + containerId); return; }

      var fire = function () {
        try {
          el.innerHTML = '';
          var s = _buildZoneScript(INPAGE.zone, INPAGE.src);
          el.appendChild(s);
          _state.inpageContainers[containerId] = true;
          _log('In-page ad injected:', containerId);
        } catch (e) { _warn('inpage inject failed', e); }
      };

      var schedule = function () {
        try { setTimeout(fire, INPAGE_SETTLE_MS); } catch (e) { fire(); }
      };

      if ('IntersectionObserver' in global) {
        try {
          var io = new IntersectionObserver(function (entries) {
            for (var i = 0; i < entries.length; i++) {
              if (entries[i].isIntersecting && entries[i].intersectionRatio >= INPAGE_VISIBLE_RATIO) {
                io.disconnect();
                schedule();
                return;
              }
            }
          }, { threshold: [0, INPAGE_VISIBLE_RATIO, 1] });
          io.observe(el);
          return;
        } catch (e) { /* fall through */ }
      }
      schedule();
    } catch (e) { _warn('loadInPagePush failed', e); }
  }

  /* ── 3. Feed ad node (Challenge feed every 3 items) ────────────────── */
  function createFeedAdNode() {
    var wrap = document.createElement('div');
    try {
      var slotId = 'kami-feed-ad-' + Math.random().toString(36).slice(2, 9);
      wrap.className = 'cf-slide kami-feed-ad';
      wrap.dataset.kamiAd = 'feed';
      wrap.style.cssText = [
        'background:linear-gradient(160deg,#1a0030,#0a001a,#001428)',
        'position:relative',
        'display:flex',
        'align-items:center',
        'justify-content:center',
        'scroll-snap-align:start'
      ].join(';');
      wrap.innerHTML =
        '<div style="position:absolute;top:14px;left:14px;font-size:10px;letter-spacing:1px;' +
        'text-transform:uppercase;color:rgba(255,255,255,0.45);font-weight:700;">Sponsored</div>' +
        '<div id="' + slotId + '" style="width:100%;max-width:340px;min-height:220px;' +
        'display:flex;align-items:center;justify-content:center;padding:24px;color:rgba(255,255,255,0.45);' +
        'font-size:12px;">Sponsored content</div>';

      setTimeout(function () { loadInPagePush(slotId); }, 0);
    } catch (e) { _warn('createFeedAdNode failed', e); }
    return wrap;
  }

  /* ── 4. Kill switch & diagnostics ──────────────────────────────────── */
  function disable() {
    global.__KAMI_ADS_DISABLE = true;
    _log('KamiAds disabled');
  }
  function _diag() {
    return {
      prod: _isProd(),
      admin: _isAdmin(),
      disabled: _disabled(),
      host: location.hostname,
      popunderArmed: _state.popunderArmed,
      popunderFired: _state.popunderFired,
      inpageContainers: Object.keys(_state.inpageContainers)
    };
  }

  /* ── 5. Auto-init on DOM ready ─────────────────────────────────────── */
  function _ready(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn, { once: true });
    } else { fn(); }
  }
  _ready(function () { try { initPopunderOnce(); } catch (e) {} });

  /* ── 6. Public API + backward-compat shims for v1 callers ──────────── */
  /*  The existing index.html still calls a few v1 names. We shim them so
   *  no edits are required in the HTML for those calls to keep working. */
  global.KamiAds = {
    /* New (preferred) API */
    initPopunderOnce: initPopunderOnce,
    loadInPagePush:   loadInPagePush,
    createFeedAdNode: createFeedAdNode,
    disable:          disable,
    _diag:            _diag,

    /* v1 shims — map old names to new behaviour */
    initPopunder:     initPopunderOnce,
    initPush:         function () { /* push removed */ },
    initInPagePush:   function () {
      /* Old code expected a global injection. We instead populate the two
         known slots if they exist on the page right now. */
      try {
        if (document.getElementById('home-ad'))   loadInPagePush('home-ad');
        if (document.getElementById('player-ad')) loadInPagePush('player-ad');
        if (document.getElementById('sidebar-ad'))loadInPagePush('sidebar-ad');
      } catch (e) {}
    },
    loadNativeAd:     function (id) { try { loadInPagePush(id); } catch (e) {} },
    loadSidebarAd:    function ()   { try { loadInPagePush('sidebar-ad'); } catch (e) {} },
    injectFeedAd:     createFeedAdNode,
    maybeShowVignette:function () { return false; /* vignette removed */ },
    onEpisodeChange:  function () { /* vignette removed — no-op */ },
    reportPageview:   function () { /* engagement push removed — no-op */ },
    reportWatchSecond:function () { /* engagement push removed — no-op */ },
    showDebug:        function () {
      try { console.log('[KamiAds]', _diag()); } catch (e) {}
    },
    state:            _state,
    config:           { popunder: POPUNDER, inpagePush: INPAGE }
  };
})(window);

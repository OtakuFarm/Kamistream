/* ════════════════════════════════════════════════════════════════════════
 * KamiStream — Ads Manager (v3, safer)
 * ────────────────────────────────────────────────────────────────────────
 * Two ad types only — Monetag Onclick (Popunder) + In-Page Push.
 * No service worker. No vignette. No multitag. No push notifications.
 *
 *   Popunder        zone 10936606   https://al5sm.com/tag.min.js
 *   In-Page Push    zone 10937463   https://nap5k.com/tag.min.js
 *
 * Why "safer":
 *   • Skips ads on dev/preview/local hosts so they never break local UX.
 *   • Popunder waits for an "idle click" — clicks on app UI (buttons, links,
 *     episode cards, feed actions) DO NOT load the popunder script. This
 *     keeps the player and trending grid from being hijacked.
 *   • Popunder script load is also wrapped in setTimeout(0) so the user's
 *     own click handler completes first.
 *   • In-page push is injected after a short delay and uses an
 *     IntersectionObserver so it only loads when the slot is on screen.
 *   • Global kill switch:  window.__KAMI_ADS_DISABLE = true   (or call
 *     KamiAds.disable() in the console) shuts everything off instantly.
 *
 * Public API (window.KamiAds.*):
 *   initPopunderOnce()           — register a one-time first-click loader
 *   loadInPagePush(containerId)  — inject in-page push into an element
 *   createFeedAdNode()           — return a DOM node for the feed loop
 *   disable()                    — kill switch
 * ════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var POPUNDER = { zone: '10936606', src: 'https://al5sm.com/tag.min.js' };
  var INPAGE   = { zone: '10937463', src: 'https://nap5k.com/tag.min.js' };

  /* Production hosts where ads are allowed. Add subdomains if needed. */
  var PROD_HOSTS = [
    'kamistream.tv',
    'www.kamistream.tv',
    'kamistream.fun',
    'www.kamistream.fun',
    'kamistream.com',
    'www.kamistream.com'
  ];

  /* Selectors that, when matched by a click target, must NOT trigger the
     popunder script load. These are the user's primary navigation paths. */
  var SAFE_CLICK_SKIP = [
    'a', 'button', 'input', 'select', 'textarea', 'video', 'iframe',
    '.tn', '.sb-item', '.mn-item',
    '.tr-card', '.ep-card', '.ep-source-pill',
    '.ap-btn-watch', '.ap-btn-watchlist',
    '.cf-action', '.cf-follow', '.cf-username',
    '.lb-item', '.tc-item',
    '.rec-tab', '.view-all'
  ].join(',');

  var POPUNDER_DELAY_MS    = 0;       // user click → load script (instant once allowed)
  var INPAGE_DELAY_MS      = 1500;    // wait 1.5s after mount call
  var INPAGE_VISIBLE_RATIO = 0.25;    // inject only when 25% in view

  /* Module-level guards prevent duplicate script injection. */
  var _popunderArmed = false;
  var _popunderFired = false;

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
    try { extra ? console.log(msg, extra) : console.log(msg); } catch (e) {}
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

  function _matchesSafeSkip(node) {
    try {
      if (!node || node.nodeType !== 1) return false;
      if (node.matches && node.matches(SAFE_CLICK_SKIP)) return true;
      if (node.closest && node.closest(SAFE_CLICK_SKIP)) return true;
      return false;
    } catch (e) { return false; }
  }

  /* ── 1. Popunder (one click on idle background, once per session) ──── */
  function initPopunderOnce() {
    if (_disabled())   return;
    if (_popunderArmed) return;
    _popunderArmed = true;

    var handler = function (ev) {
      if (_popunderFired) return;
      /* Skip clicks on actual app UI — let the user navigate cleanly. */
      if (_matchesSafeSkip(ev.target)) return;

      _popunderFired = true;
      try {
        document.removeEventListener('click', handler, true);
        document.removeEventListener('touchstart', handler, true);
      } catch (e) {}

      /* Defer to next tick so the user's own click handler runs first. */
      setTimeout(function () {
        try {
          var s = _buildZoneScript(POPUNDER.zone, POPUNDER.src);
          document.body.appendChild(s);
          _log('Popunder loaded');
        } catch (e) { _warn('popunder inject failed', e); _popunderFired = false; }
      }, POPUNDER_DELAY_MS);
    };

    try {
      document.addEventListener('click',     handler, { passive: true });
      document.addEventListener('touchstart', handler, { passive: true });
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
          _log('In-page ad injected:', containerId);
        } catch (e) { _warn('inpage inject failed', e); }
      };

      var schedule = function () {
        try { setTimeout(fire, INPAGE_DELAY_MS); } catch (e) { fire(); }
      };

      /* Defer until the slot is visible — saves bandwidth and keeps the
         home-ad / player-ad slots from loading off-screen. */
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
        } catch (e) { /* fall through to direct schedule */ }
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

      /* Defer until the slot is in the DOM and (via IO) actually visible. */
      setTimeout(function () { loadInPagePush(slotId); }, 0);
    } catch (e) { _warn('createFeedAdNode failed', e); }
    return wrap;
  }

  /* ── 4. Kill switch ────────────────────────────────────────────────── */
  function disable() {
    global.__KAMI_ADS_DISABLE = true;
    _log('KamiAds disabled');
  }

  /* ── 5. Auto-init: arm popunder when DOM is ready ──────────────────── */
  function _ready(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn, { once: true });
    } else { fn(); }
  }
  _ready(function () { try { initPopunderOnce(); } catch (e) {} });

  /* ── 6. Public API ─────────────────────────────────────────────────── */
  global.KamiAds = {
    initPopunderOnce: initPopunderOnce,
    loadInPagePush:   loadInPagePush,
    createFeedAdNode: createFeedAdNode,
    disable:          disable,
    _diag: function () {
      return {
        prod: _isProd(),
        admin: _isAdmin(),
        disabled: _disabled(),
        popunderArmed: _popunderArmed,
        popunderFired: _popunderFired
      };
    }
  };
})(window);

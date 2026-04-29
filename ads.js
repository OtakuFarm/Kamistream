/* ════════════════════════════════════════════════════════════════════════
 * KamiStream — Ads Manager (v2, clean)
 * ────────────────────────────────────────────────────────────────────────
 * Two ad types only — Monetag Onclick (Popunder) + In-Page Push.
 * No service worker. No vignette. No multitag. No push notifications.
 *
 *   Popunder        zone 10936606   https://al5sm.com/tag.min.js
 *   In-Page Push    zone 10937463   https://nap5k.com/tag.min.js
 *
 * Public API (window.KamiAds.*):
 *   initPopunderOnce()           → registers a one-time first-click loader
 *   loadInPagePush(containerId)  → injects in-page push into an element
 *   createFeedAdNode()           → returns a DOM node for the feed loop
 *
 * All ad logic is wrapped in try/catch — ads MUST NEVER crash the app.
 * ════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var POPUNDER = { zone: '10936606', src: 'https://al5sm.com/tag.min.js' };
  var INPAGE   = { zone: '10937463', src: 'https://nap5k.com/tag.min.js' };

  /* Module-level guards prevent duplicate script injection. */
  var _popunderArmed = false;   // listener attached
  var _popunderFired = false;   // script appended

  function _isAdmin() {
    try { return /admin/i.test(location.pathname || ''); } catch (e) { return false; }
  }

  /* Build a Monetag-style script tag for a given zone. */
  function _buildZoneScript(zone, src) {
    var s = document.createElement('script');
    s.src   = src;
    s.async = true;
    s.dataset.zone = zone;
    s.setAttribute('data-cfasync', 'false');
    return s;
  }

  /* ── 1. Popunder (one click, one load per session) ─────────────────── */
  function initPopunderOnce() {
    if (_isAdmin()) return;
    if (_popunderArmed) return;
    _popunderArmed = true;

    var handler = function () {
      if (_popunderFired) return;
      _popunderFired = true;
      try {
        var s = _buildZoneScript(POPUNDER.zone, POPUNDER.src);
        document.body.appendChild(s);
        try { console.log('Popunder loaded'); } catch (e) {}
      } catch (e) {
        try { console.warn('[KamiAds] popunder inject failed', e); } catch (_) {}
      }
    };

    try {
      document.addEventListener('click',     handler, { once: true, passive: true });
      document.addEventListener('touchstart', handler, { once: true, passive: true });
    } catch (e) {
      /* Older browsers without {once} options object — fall back. */
      var wrap = function () {
        document.removeEventListener('click', wrap);
        document.removeEventListener('touchstart', wrap);
        handler();
      };
      try { document.addEventListener('click', wrap); } catch (_) {}
      try { document.addEventListener('touchstart', wrap); } catch (_) {}
    }
  }

  /* ── 2. In-Page Push (renders inside an explicit container) ────────── */
  function loadInPagePush(containerId) {
    if (_isAdmin()) return;
    try {
      if (!containerId) return;
      var el = document.getElementById(containerId);
      if (!el) {
        try { console.warn('[KamiAds] container not found:', containerId); } catch (_) {}
        return;
      }
      /* Clear any previous render so SPA re-mounts get a fresh ad. */
      el.innerHTML = '';
      var s = _buildZoneScript(INPAGE.zone, INPAGE.src);
      el.appendChild(s);
      try { console.log('In-page ad injected:', containerId); } catch (e) {}
    } catch (e) {
      try { console.warn('[KamiAds] inpage inject failed', e); } catch (_) {}
    }
  }

  /* ── 3. Feed ad node (Challenge feed every 3 items) ────────────────── */
  function createFeedAdNode() {
    var wrap = document.createElement('div');
    try {
      var slotId = 'kami-feed-ad-' + Math.random().toString(36).slice(2, 9);
      /* Match the feed slide visual frame so layout stays consistent. */
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
        'display:flex;align-items:center;justify-content:center;padding:24px;"></div>';

      /* Defer injection until the slot is in the DOM, then load. */
      setTimeout(function () { loadInPagePush(slotId); }, 0);
    } catch (e) {
      try { console.warn('[KamiAds] createFeedAdNode failed', e); } catch (_) {}
    }
    return wrap;
  }

  /* ── 4. Auto-init: arm popunder as soon as DOM is ready ────────────── */
  function _ready(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn, { once: true });
    } else {
      fn();
    }
  }
  _ready(function () { try { initPopunderOnce(); } catch (e) {} });

  /* ── 5. Public API ─────────────────────────────────────────────────── */
  global.KamiAds = {
    initPopunderOnce: initPopunderOnce,
    loadInPagePush:   loadInPagePush,
    createFeedAdNode: createFeedAdNode
  };
})(window);

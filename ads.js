/* ════════════════════════════════════════════════════════════════════════
 * KamiStream — Ads Manager  (v1)
 * ────────────────────────────────────────────────────────────────────────
 * Single source of truth for every ad on the site. UI code never touches
 * an ad-network URL directly — it calls window.KamiAds.* helpers below.
 *
 * Networks supported out of the box:
 *   • Monetag Push           (zone 10936608)  — site-wide, loads once
 *   • Monetag OnClick/Popunder (zone 10936606) — first click, once per session
 *   • Monetag Vignette       (zone 10936591)  — episode change + feed milestones
 *   • Monetag In-Page Push   (zone 10937463)  — site-wide, loads once
 *   • Optional native/banner zones            — drop ID into AD_CONFIG.native
 *
 * Anything that fails is swallowed — ads MUST NEVER crash the player or feed.
 * ════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  /* ── 1. CONFIG ─────────────────────────────────────────────────────── */
  const AD_CONFIG = {
    push:       { zone: '10936608', src: 'https://5gvci.com/act/files/tag.min.js', enabled: false }, // SW-based — disabled per site policy
    popunder:   { zone: '10936606', src: 'https://al5sm.com/tag.min.js',           enabled: true  },
    vignette:   { zone: '10936591', src: 'https://n6wxm.com/vignette.min.js',      enabled: false }, // disabled per site policy
    inpagePush: { zone: '10937463', src: 'https://nap5k.com/tag.min.js',           enabled: true  },

    // Drop a Monetag native/banner zone here when you create one.
    native:     { zone: '',         src: '',                                       enabled: false },

    // Frequency caps — tune for revenue ↔ UX balance.
    caps: {
      vignetteCooldownMs: 5 * 60 * 1000,   // 5 min between vignettes
      vignetteHourlyMax:  3,                // max 3 vignettes/hour
      feedAdEvery:        3,                // 1 ad slide per 3 videos
      pushDelayMs:        15 * 1000,        // fallback delay if engagement trigger never fires
      enableOnAdmin:      false             // never load on admin.html
    },

    // Push opt-in optimizer — wait for ANY of these signals before prompting.
    // Highest opt-in rates come from prompting AFTER the user is engaged.
    pushOptimizer: {
      enabled:           true,
      minWatchSeconds:   30,        // 30s of player time → high-intent visitor
      minPageDwellMs:    45 * 1000, // OR 45s on the site
      minPageviews:      2,         // OR they navigated to a 2nd view
      requireInteraction: true      // still require at least one click first
    }
  };

  /* ── 2. STATE & STORAGE ────────────────────────────────────────────── */
  const _state = {
    pushLoaded: false,
    popunderLoaded: false,
    vignetteLoaded: false,
    inpageLoaded: false,
    nativeLoaded: false,
    firstInteraction: false
  };
  const _now = () => Date.now();
  const _kKey = k => 'kami_ad_' + k;
  const _read = k => { try { return JSON.parse(localStorage.getItem(_kKey(k)) || 'null'); } catch (e) { return null; } };
  const _write = (k, v) => { try { localStorage.setItem(_kKey(k), JSON.stringify(v)); } catch (e) {} };
  const _log  = (...a) => { try { console.debug('[KamiAds]', ...a); } catch (e) {} };
  const _warn = (...a) => { try { console.warn('[KamiAds]', ...a); } catch (e) {} };

  /* Skip everything when running on admin panel. */
  function _isAdmin() {
    return /admin/i.test(location.pathname) || /admin/i.test(document.title || '');
  }

  /* ── 3. CORE: safe script injection ────────────────────────────────── */
  function _injectScript(src, attrs) {
    return new Promise((resolve, reject) => {
      try {
        const s = document.createElement('script');
        s.src = src;
        s.async = true;
        s.setAttribute('data-cfasync', 'false');
        if (attrs) Object.keys(attrs).forEach(k => s.setAttribute(k, attrs[k]));
        s.onload  = () => resolve(s);
        s.onerror = (e) => { _warn('script failed', src); reject(e); };
        (document.head || document.body || document.documentElement).appendChild(s);
      } catch (e) { _warn('inject error', e); reject(e); }
    });
  }

  /* Monetag IIFE-style loader (used by popunder, vignette, in-page push). */
  function _injectZoneScript(zone, src) {
    try {
      const s = document.createElement('script');
      s.dataset.zone = zone;
      s.src = src;
      s.setAttribute('data-cfasync', 'false');
      s.async = true;
      // Monetag's official one-liner appends to the LAST <script> on the page;
      // mirror that behaviour so it works the same way:
      const target = [document.documentElement, document.body].filter(Boolean).pop();
      target.appendChild(s);
    } catch (e) { _warn('zone-inject error', e); }
  }

  /* ── 4. PUSH NOTIFICATION ADS (always-on, load once) ───────────────── */
  /*  Push ads need a service worker at the SITE ROOT (sw.js). We register
   *  it ourselves to be explicit — Monetag's tag also auto-registers, but
   *  doing it here surfaces failures cleanly in the console.            */
  function _registerPushSW() {
    // Push/SW ads disabled — no service worker used on this site.
  }
  function initPush() {
    if (_state.pushLoaded || !AD_CONFIG.push.enabled || _isAdmin()) return;
    _state.pushLoaded = true;
    try {
      _registerPushSW();
      _injectScript(`${AD_CONFIG.push.src}?z=${AD_CONFIG.push.zone}`)
        .catch(() => { _state.pushLoaded = false; });
      _log('push loaded');
    } catch (e) { _warn('initPush', e); _state.pushLoaded = false; }
  }

  /* ── 5. POPUNDER (first user click, once per session) ──────────────── */
  function initPopunder() {
    if (_state.popunderLoaded || !AD_CONFIG.popunder.enabled || _isAdmin()) return;
    _state.popunderLoaded = true;
    try {
      _injectZoneScript(AD_CONFIG.popunder.zone, AD_CONFIG.popunder.src);
      _log('popunder loaded');
    } catch (e) { _warn('initPopunder', e); _state.popunderLoaded = false; }
  }

  /* ── 6. IN-PAGE PUSH (always-on, load once) ────────────────────────── */
  function initInPagePush() {
    if (_state.inpageLoaded || !AD_CONFIG.inpagePush.enabled || _isAdmin()) return;
    _state.inpageLoaded = true;
    try {
      _injectZoneScript(AD_CONFIG.inpagePush.zone, AD_CONFIG.inpagePush.src);
      _log('inpage-push loaded');
    } catch (e) { _warn('initInPagePush', e); _state.inpageLoaded = false; }
  }

  /* ── 7. VIGNETTE (full-screen interstitial — rate-limited) ─────────── */
  function _vignetteAllowed() {
    const last = _read('vig_last') || 0;
    if (_now() - last < AD_CONFIG.caps.vignetteCooldownMs) return false;
    const log = _read('vig_log') || [];
    const cutoff = _now() - 60 * 60 * 1000;
    const recent = log.filter(t => t > cutoff);
    if (recent.length >= AD_CONFIG.caps.vignetteHourlyMax) return false;
    return true;
  }
  function _stampVignette() {
    _write('vig_last', _now());
    const log = (_read('vig_log') || []).filter(t => t > _now() - 60 * 60 * 1000);
    log.push(_now());
    _write('vig_log', log);
  }
  function maybeShowVignette(reason) {
    if (!AD_CONFIG.vignette.enabled || _isAdmin()) return false;
    if (!_vignetteAllowed()) { _log('vignette skipped (cooldown)', reason); return false; }
    try {
      if (!_state.vignetteLoaded) {
        _injectZoneScript(AD_CONFIG.vignette.zone, AD_CONFIG.vignette.src);
        _state.vignetteLoaded = true;
      } else if (global.show_10936591 && typeof global.show_10936591 === 'function') {
        // Some Monetag vignette zones expose a global trigger after first load;
        // call it on subsequent triggers to avoid re-injecting the script.
        try { global.show_10936591(); } catch (e) {}
      }
      _stampVignette();
      _log('vignette fired', reason);
      return true;
    } catch (e) { _warn('vignette error', e); return false; }
  }

  /* ── 8. NATIVE / BANNER (only if you have a zone) ──────────────────── */
  function loadNativeAd(containerId) {
    if (!AD_CONFIG.native.enabled || !AD_CONFIG.native.zone || _isAdmin()) return;
    const el = document.getElementById(containerId);
    if (!el) return;
    if (el.dataset.kamiAdLoaded === '1') return;          // dedupe per container
    el.dataset.kamiAdLoaded = '1';
    // Lazy-load via IntersectionObserver to keep first paint fast.
    try {
      const fire = () => {
        try {
          el.innerHTML = '';
          const inner = document.createElement('div');
          inner.className = 'kami-native-ad';
          el.appendChild(inner);
          _injectZoneScript(AD_CONFIG.native.zone, AD_CONFIG.native.src);
        } catch (e) { _warn('native fire', e); }
      };
      if ('IntersectionObserver' in global) {
        const io = new IntersectionObserver((entries) => {
          entries.forEach(en => { if (en.isIntersecting) { io.disconnect(); fire(); } });
        }, { rootMargin: '200px' });
        io.observe(el);
      } else { fire(); }
    } catch (e) { _warn('loadNativeAd', e); }
  }

  /* ── 9. IN-FEED AD CARD (Challenge / TikTok-style feed) ────────────── */
  /*  Returns a DOM node sized like a cf-slide so it snap-scrolls in line
   *  with real videos. If you have a native zone we render it inside; if
   *  not, we use a vignette trigger when the slide becomes visible.    */
  function injectFeedAd() {
    const el = document.createElement('div');
    el.className = 'cf-slide kami-feed-ad';
    el.dataset.kamiAd = 'feed';
    el.style.cssText = 'background:linear-gradient(160deg,#1a0030,#0a001a,#001428);position:relative;display:flex;align-items:center;justify-content:center;';
    el.innerHTML = `
      <div style="position:absolute;top:14px;left:14px;font-size:10px;letter-spacing:1px;text-transform:uppercase;color:rgba(255,255,255,0.45);font-weight:700;">Sponsored</div>
      <div id="kami-feed-ad-${Math.random().toString(36).slice(2,8)}" style="width:100%;max-width:340px;min-height:260px;display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,0.55);font-size:13px;text-align:center;padding:24px;">
        <div>Loading sponsored content…</div>
      </div>`;
    const slot = el.querySelector('[id^="kami-feed-ad-"]');

    // When the slide becomes visible, either fill with native or fire vignette.
    try {
      if ('IntersectionObserver' in global) {
        const io = new IntersectionObserver((entries) => {
          entries.forEach(en => {
            if (en.isIntersecting && en.intersectionRatio > 0.6) {
              io.disconnect();
              if (AD_CONFIG.native.enabled && AD_CONFIG.native.zone) {
                slot.innerHTML = '';
                slot.id = 'kami-native-' + Date.now();
                _injectZoneScript(AD_CONFIG.native.zone, AD_CONFIG.native.src);
              } else {
                maybeShowVignette('feed-card');
              }
            }
          });
        }, { threshold: [0, 0.6, 1] });
        io.observe(el);
      }
    } catch (e) { _warn('feed ad observer', e); }
    return el;
  }

  /* ── 10. SIDEBAR AD (sticky native, optional) ──────────────────────── */
  function loadSidebarAd() { loadNativeAd('sidebar-ad'); }

  /* ── 11. EPISODE CHANGE TRIGGER ────────────────────────────────────── */
  /*  Wire this into your "next episode" / episode-button click handler. */
  function onEpisodeChange() {
    try { maybeShowVignette('episode-change'); } catch (e) { _warn('onEpisodeChange', e); }
  }

  /* ── 12. PUSH OPT-IN OPTIMIZER ─────────────────────────────────────── */
  /*  Fires push prompt only when the visitor shows engagement signals —
   *  typically 2-3x higher opt-in rate than prompting on first click.    */
  const _engage = { dwellStart: 0, watchSec: 0, pageviews: 1, watchTimer: null, fired: false };

  function _markPushReady(reason) {
    if (_engage.fired) return;
    if (!AD_CONFIG.pushOptimizer.enabled) return;
    if (AD_CONFIG.pushOptimizer.requireInteraction && !_state.firstInteraction) return;
    _engage.fired = true;
    _log('push trigger:', reason);
    try { initPush(); initInPagePush(); } catch (e) {}
  }

  /*  Public hook your <video>/<iframe> player can call once per second
   *  while playing. Auto-wired to <video> elements below.               */
  function reportWatchSecond() {
    if (_engage.fired) return;
    _engage.watchSec += 1;
    if (_engage.watchSec >= AD_CONFIG.pushOptimizer.minWatchSeconds) {
      _markPushReady('watch ' + _engage.watchSec + 's');
    }
  }

  /*  Call when the SPA navigates to a new view (Home → Watch, etc).    */
  function reportPageview() {
    if (_engage.fired) return;
    _engage.pageviews += 1;
    if (_engage.pageviews >= AD_CONFIG.pushOptimizer.minPageviews) {
      _markPushReady('pageviews ' + _engage.pageviews);
    }
  }

  function _autoWatchTracking() {
    /*  Auto-detect HTML5 video playback site-wide. Counts a "watched
     *  second" each second any <video> is playing (not paused).         */
    try {
      if (_engage.watchTimer) return;
      _engage.watchTimer = setInterval(() => {
        try {
          const vids = document.querySelectorAll('video');
          let playing = false;
          vids.forEach(v => { if (!v.paused && !v.ended && v.readyState > 2) playing = true; });
          if (playing) reportWatchSecond();
        } catch (e) {}
      }, 1000);
    } catch (e) {}
  }

  function _dwellTimer() {
    /*  Fallback: prompt after N seconds on the site even without video. */
    setTimeout(() => _markPushReady('dwell ' + AD_CONFIG.pushOptimizer.minPageDwellMs + 'ms'),
               AD_CONFIG.pushOptimizer.minPageDwellMs);
  }

  /* ── 13. AUTO-WIRING ───────────────────────────────────────────────── */
  function _firstInteractionHandler() {
    if (_state.firstInteraction) return;
    _state.firstInteraction = true;
    try { initPopunder(); } catch (e) {}        // popunder fires immediately on first click

    if (AD_CONFIG.pushOptimizer.enabled) {
      // Push waits for engagement signals (watch time / dwell / pageviews)
      _engage.dwellStart = _now();
      _autoWatchTracking();
      _dwellTimer();
    } else {
      // Old behaviour — fixed delay after first click
      setTimeout(() => { try { initPush(); initInPagePush(); } catch (e) {} },
                 AD_CONFIG.caps.pushDelayMs);
    }
  }
  function _bootstrap() {
    if (_isAdmin() && !AD_CONFIG.caps.enableOnAdmin) { _log('skipped on admin'); return; }
    document.addEventListener('click',     _firstInteractionHandler, { once: true, capture: true, passive: true });
    document.addEventListener('touchstart', _firstInteractionHandler, { once: true, capture: true, passive: true });
    document.addEventListener('keydown',   _firstInteractionHandler, { once: true, capture: true });
    ['home-ad', 'player-ad', 'sidebar-ad'].forEach(id => loadNativeAd(id));
    // Monetag in-page push — loads once globally
    initInPagePush();
    if (/[?&]adsdebug=1/.test(location.search)) _showDebugOverlay();
  }

  /* ── 14. DEBUG OVERLAY  (?adsdebug=1) ──────────────────────────────── */
  function _showDebugOverlay() {
    try {
      const box = document.createElement('div');
      box.id = 'kami-ads-debug';
      box.style.cssText = 'position:fixed;bottom:12px;right:12px;z-index:2147483647;background:rgba(0,0,0,0.92);color:#0f0;font:12px/1.5 monospace;padding:12px 14px;border-radius:8px;border:1px solid #0f0;max-width:320px;pointer-events:auto;';
      document.body.appendChild(box);
      const refresh = () => {
        const dwell = _engage.dwellStart ? Math.floor((_now() - _engage.dwellStart) / 1000) : 0;
        box.innerHTML = `
          <div style="color:#fff;font-weight:bold;margin-bottom:6px;">KamiAds debug</div>
          <div>SW supported: ${'serviceWorker' in navigator ? 'yes' : 'NO'}</div>
          <div>HTTPS: ${location.protocol === 'https:' ? 'yes' : 'NO ⚠'}</div>
          <div>First click: ${_state.firstInteraction ? 'yes' : 'waiting…'}</div>
          <div>Push loaded: ${_state.pushLoaded ? '✓' : '—'}</div>
          <div>Popunder loaded: ${_state.popunderLoaded ? '✓' : '—'}</div>
          <div>InPage loaded: ${_state.inpageLoaded ? '✓' : '—'}</div>
          <div>Vignette loaded: ${_state.vignetteLoaded ? '✓' : '—'}</div>
          <div>Native zone set: ${AD_CONFIG.native.zone ? 'yes' : 'NO'}</div>
          <div>Watch sec: ${_engage.watchSec}/${AD_CONFIG.pushOptimizer.minWatchSeconds}</div>
          <div>Dwell: ${dwell}s/${AD_CONFIG.pushOptimizer.minPageDwellMs/1000}s</div>
          <div>Pageviews: ${_engage.pageviews}/${AD_CONFIG.pushOptimizer.minPageviews}</div>
          <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;">
            <button onclick="window.KamiAds.initPush()"      style="background:#222;color:#0f0;border:1px solid #0f0;padding:3px 6px;font:11px monospace;cursor:pointer;">force push</button>
            <button onclick="window.KamiAds.initPopunder()"  style="background:#222;color:#0f0;border:1px solid #0f0;padding:3px 6px;font:11px monospace;cursor:pointer;">force popunder</button>
            <button onclick="window.KamiAds.maybeShowVignette('debug')" style="background:#222;color:#0f0;border:1px solid #0f0;padding:3px 6px;font:11px monospace;cursor:pointer;">force vignette</button>
            <button onclick="document.getElementById('kami-ads-debug').remove()" style="background:#400;color:#f88;border:1px solid #f88;padding:3px 6px;font:11px monospace;cursor:pointer;">close</button>
          </div>`;
      };
      refresh();
      setInterval(refresh, 1000);
    } catch (e) { _warn('debug overlay', e); }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _bootstrap);
  } else { _bootstrap(); }

  /* ── 13. PUBLIC API ────────────────────────────────────────────────── */
  global.KamiAds = {
    config:            AD_CONFIG,
    initPush:          initPush,
    initPopunder:      initPopunder,
    initInPagePush:    initInPagePush,
    loadNativeAd:      loadNativeAd,
    loadSidebarAd:     loadSidebarAd,
    injectFeedAd:      injectFeedAd,
    maybeShowVignette: maybeShowVignette,
    onEpisodeChange:   onEpisodeChange,
    // Push optimizer hooks — call these from your SPA router / video player:
    reportPageview:    reportPageview,
    reportWatchSecond: reportWatchSecond,
    // Debug helpers:
    showDebug:         _showDebugOverlay,
    state:             _state
  };
})(window);

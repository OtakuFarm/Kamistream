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
    push:       { zone: '10936608', src: 'https://5gvci.com/act/files/tag.min.js', enabled: true },
    popunder:   { zone: '10936606', src: 'https://al5sm.com/tag.min.js',           enabled: true },
    vignette:   { zone: '10936591', src: 'https://n6wxm.com/vignette.min.js',      enabled: true },
    inpagePush: { zone: '10937463', src: 'https://nap5k.com/tag.min.js',           enabled: true },

    // Drop a Monetag native/banner zone here when you create one.
    native:     { zone: '',         src: '',                                       enabled: false },

    // Frequency caps — tune for revenue ↔ UX balance.
    caps: {
      vignetteCooldownMs: 5 * 60 * 1000,   // 5 min between vignettes
      vignetteHourlyMax:  3,                // max 3 vignettes/hour
      feedAdEvery:        3,                // 1 ad slide per 3 videos
      pushDelayMs:        15 * 1000,        // delay push prompt 15s after first interaction
      enableOnAdmin:      false             // never load on admin.html
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
  function initPush() {
    if (_state.pushLoaded || !AD_CONFIG.push.enabled || _isAdmin()) return;
    _state.pushLoaded = true;
    try {
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

  /* ── 12. AUTO-WIRING ───────────────────────────────────────────────── */
  function _firstInteractionHandler() {
    if (_state.firstInteraction) return;
    _state.firstInteraction = true;
    try { initPopunder(); } catch (e) {}
    // Delay push & in-page push slightly so we don't hammer first-time visitors.
    setTimeout(() => { try { initPush(); initInPagePush(); } catch (e) {} },
               AD_CONFIG.caps.pushDelayMs);
  }
  function _bootstrap() {
    if (_isAdmin() && !AD_CONFIG.caps.enableOnAdmin) { _log('skipped on admin'); return; }
    // First user gesture loads popunder + (delayed) push.
    document.addEventListener('click',     _firstInteractionHandler, { once: true, capture: true, passive: true });
    document.addEventListener('touchstart', _firstInteractionHandler, { once: true, capture: true, passive: true });
    document.addEventListener('keydown',   _firstInteractionHandler, { once: true, capture: true });
    // Native containers that already exist on first paint:
    ['home-ad', 'player-ad', 'sidebar-ad'].forEach(id => loadNativeAd(id));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _bootstrap);
  } else { _bootstrap(); }

  /* ── 13. PUBLIC API ────────────────────────────────────────────────── */
  global.KamiAds = {
    config:           AD_CONFIG,
    initPush:         initPush,
    initPopunder:     initPopunder,
    initInPagePush:   initInPagePush,
    loadNativeAd:     loadNativeAd,
    loadSidebarAd:    loadSidebarAd,
    injectFeedAd:     injectFeedAd,
    maybeShowVignette: maybeShowVignette,
    onEpisodeChange:  onEpisodeChange
  };
})(window);

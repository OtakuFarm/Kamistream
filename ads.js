/* ════════════════════════════════════════════════════════════════════════
 * KamiStream — Ads Manager (v6, card-overlay popunder)
 * ────────────────────────────────────────────────────────────────────────
 * Popunder     zone 10936606   https://al5sm.com/tag.min.js
 * In-Page Push zone 10937463   https://nap5k.com/tag.min.js
 *
 * v6 — Card Overlay System:
 *   Every clickable card gets a transparent position:absolute overlay.
 *   Tapping the overlay fires the popunder (with cooldown) AND immediately
 *   triggers the card's real onclick — both happen in the same gesture.
 *   Scroll gestures pass straight through via touch-action:pan-y.
 *   Site never feels blocked because the card action fires first (sync),
 *   popunder script loads after 250ms defer (async).
 *
 *   Cooldown:  5 min (T1 geo: 4 min) via localStorage
 *   Active user second pop: requires 3+ card clicks after cooldown
 *   Overlay re-applied after SPA navigation via MutationObserver
 * ════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var POPUNDER = { zone: '10936606', src: 'https://al5sm.com/tag.min.js' };
  var INPAGE   = { zone: '10937463', src: 'https://nap5k.com/tag.min.js' };

  var PROD_HOSTS = [
    'kamistream.tv',  'www.kamistream.tv',
    'kamistream.fun', 'www.kamistream.fun',
    'kamistream.com', 'www.kamistream.com'
  ];

  /* ── Constants ── */
  var POP_COOLDOWN_MS   = 5 * 60 * 1000;
  var POP_ACTIVE_CLICKS = 3;
  var TIMED_SLOT_DELAY  = 25;
  var DEPTH_MIN_GAP_MS  = 2 * 60 * 1000;
  var EP_AD_GAP_MS      = 60 * 1000;
  var INPAGE_SETTLE_MS  = 1200;
  var INPAGE_VIS_RATIO  = 0.25;
  var INPAGE_VIS_MS     = 2000;
  var POPUNDER_DEFER_MS = 250;
  var POP_LS_KEY        = 'kami_lastPopTime';

  /* Card selectors that get the overlay */
  var CARD_SELECTORS = [
    '.tr-card', '.cw-card', '.bfv-card', '.ep-card',
    '.rel-card', '.ru-card', '.pw-item', '.wl-card',
    '.cf-slide:not(.kami-feed-ad)'
  ].join(',');

  /* Session state */
  var _s = {
    overlayArmed:      false,
    clickCount:        0,
    inpageContainers:  {},
    timedSlots:        {},
    lastDepthTrigger:  0,
    episodeAdCooldown: 0,
    geoTier:           null,
    overlayObserver:   null
  };

  /* ── Core helpers ── */
  function _isAdmin(){ try{ return /admin/i.test(location.pathname||''); }catch(e){ return false; } }
  function _isProd(){
    try{
      var h=(location.hostname||'').toLowerCase();
      for(var i=0;i<PROD_HOSTS.length;i++) if(h===PROD_HOSTS[i]) return true;
      return false;
    }catch(e){ return false; }
  }
  function _disabled(){ return !!global.__KAMI_ADS_DISABLE||_isAdmin()||!_isProd(); }
  function _log(m,x){ try{ x!==undefined?console.log(m,x):console.log(m); }catch(e){} }
  function _warn(m,e){ try{ console.warn('[KamiAds] '+m,e||''); }catch(_){} }
  function _now(){ return Date.now(); }
  function _lsGet(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }
  function _lsSet(k,v){ try{ localStorage.setItem(k,v); }catch(e){} }
  function _ssGet(k){ try{ return sessionStorage.getItem(k); }catch(e){ return null; } }
  function _ssSet(k,v){ try{ sessionStorage.setItem(k,v); }catch(e){} }

  function _buildZoneScript(zone, src){
    var s=document.createElement('script');
    s.src=src; s.async=true;
    s.dataset.zone=zone;
    s.setAttribute('data-cfasync','false');
    s.onerror=function(){ _warn('script blocked: '+src); };
    return s;
  }

  /* ── Geo detection ── */
  var TIER1 = {
    US:1,GB:1,CA:1,AU:1,DE:1,FR:1,NL:1,SE:1,NO:1,DK:1,
    FI:1,CH:1,AT:1,BE:1,IE:1,NZ:1,SG:1,JP:1,KR:1
  };
  function _detectGeo(){
    var cached=_ssGet('kami_geo_tier');
    if(cached){ _s.geoTier=cached; return; }
    try{
      fetch('https://ipapi.co/country/',{cache:'force-cache'})
        .then(function(r){ return r.text(); })
        .then(function(c){
          var tier=TIER1[(c||'').trim().toUpperCase()]?'T1':'T3';
          _s.geoTier=tier; _ssSet('kami_geo_tier',tier);
          _log('[KamiAds] Geo:',tier);
        }).catch(function(){ _s.geoTier='T3'; });
    }catch(e){ _s.geoTier='T3'; }
  }
  function _popCooldown(){
    return _s.geoTier==='T1' ? 4*60*1000 : POP_COOLDOWN_MS;
  }
  function _popCooledDown(){
    var last=parseInt(_lsGet(POP_LS_KEY)||'0');
    return (_now()-last) >= _popCooldown();
  }

  /* ════════════════════════════════════════════════════════════════
   * CARD OVERLAY SYSTEM
   * ════════════════════════════════════════════════════════════════ */

  /* Fire the popunder script */
  function _firePop(){
    setTimeout(function(){
      try{
        /* Remove stale script tag before re-injecting */
        var old=document.querySelector('script[data-zone="'+POPUNDER.zone+'"]');
        if(old) old.remove();

        var s=_buildZoneScript(POPUNDER.zone, POPUNDER.src);
        document.body.appendChild(s);
        _lsSet(POP_LS_KEY, String(_now()));
        _log('[KamiAds] Popunder fired. Clicks:',_s.clickCount);

        /* Restore site immediately after injection */
        setTimeout(function(){
          try{ if(typeof global.__kamiRestoreSite==='function') global.__kamiRestoreSite(); }catch(e){}
        }, 300);
      }catch(e){ _warn('popunder inject failed',e); }
    }, POPUNDER_DEFER_MS);
  }

  /* Build a single overlay div for a card */
  function _makeOverlay(card){
    /* Don't double-wrap */
    if(card.querySelector('.kami-card-overlay')) return;
    /* Ensure card is position:relative */
    var pos = window.getComputedStyle(card).position;
    if(pos==='static') card.style.position='relative';

    var ov = document.createElement('div');
    ov.className = 'kami-card-overlay';

    var fired = false; /* per-overlay lock */

    function handleTap(ev){
      _s.clickCount++;

      /* Always let the card's real action fire — synthetic click on card */
      /* We stop propagation on the overlay so the card's own listener
         doesn't double-fire, then manually dispatch to it */
      ev.stopPropagation();

      /* Fire popunder if cooldown allows */
      var last = parseInt(_lsGet(POP_LS_KEY)||'0');
      var everFired = last > 0;
      var qualifies = _popCooledDown() && (!everFired || _s.clickCount >= POP_ACTIVE_CLICKS);

      if(qualifies && !fired){
        fired = true;
        _firePop();
      }

      /* Trigger the card's own onclick immediately */
      ov.style.pointerEvents = 'none'; /* step aside */
      var realEl = document.elementFromPoint(
        ev.clientX || (ev.touches && ev.touches[0] ? ev.touches[0].clientX : 0),
        ev.clientY || (ev.touches && ev.touches[0] ? ev.touches[0].clientY : 0)
      );
      ov.style.pointerEvents = ''; /* restore */

      /* Try real element click first, fallback to card click */
      if(realEl && realEl !== ov){
        realEl.click();
      } else {
        /* Fallback: find and call the card's onclick directly */
        try{
          var fn = card.getAttribute('onclick');
          if(fn){ new Function(fn).call(card); }
          else{ card.click(); }
        }catch(e){ card.click(); }
      }
    }

    ov.addEventListener('click',      handleTap, false);
    ov.addEventListener('touchend',   handleTap, { passive: false });

    card.appendChild(ov);
  }

  /* Apply overlays to all matching cards in a container */
  function _applyOverlays(root){
    if(_disabled()) return;
    root = root || document;
    try{
      var cards = root.querySelectorAll(CARD_SELECTORS);
      for(var i=0;i<cards.length;i++) _makeOverlay(cards[i]);
      _log('[KamiAds] Overlays applied:',cards.length);
    }catch(e){ _warn('applyOverlays failed',e); }
  }

  /* Watch the DOM for new cards added by SPA navigation */
  function _watchForNewCards(){
    if(_s.overlayObserver) return;
    if(!('MutationObserver' in global)) return;
    try{
      var debounce = null;
      _s.overlayObserver = new MutationObserver(function(mutations){
        var hasCards = false;
        for(var i=0;i<mutations.length;i++){
          var added = mutations[i].addedNodes;
          for(var j=0;j<added.length;j++){
            var n=added[j];
            if(n.nodeType===1){
              /* Check if the added node IS a card or CONTAINS cards */
              if(n.matches && n.matches(CARD_SELECTORS)){ hasCards=true; break; }
              if(n.querySelector && n.querySelector(CARD_SELECTORS)){ hasCards=true; break; }
            }
          }
          if(hasCards) break;
        }
        if(hasCards){
          clearTimeout(debounce);
          debounce = setTimeout(function(){ _applyOverlays(); }, 120);
        }
      });
      _s.overlayObserver.observe(document.body, { childList:true, subtree:true });
    }catch(e){ _warn('watchForNewCards failed',e); }
  }

  /* Main entry — called once on load */
  function initOverlayAds(){
    if(_disabled()) return;
    if(_s.overlayArmed) return;
    _s.overlayArmed = true;
    _applyOverlays();
    _watchForNewCards();
  }

  /* Legacy name kept for any existing calls */
  function initPopunderOnce(){ initOverlayAds(); }

  /* ════════════════════════════════════════════════════════════════
   * IN-PAGE PUSH — unchanged from v5
   * ════════════════════════════════════════════════════════════════ */
  function loadInPagePush(containerId, force){
    if(_disabled()) return;
    try{
      if(!containerId) return;
      if(!force && _s.inpageContainers[containerId]) return;
      var el=document.getElementById(containerId);
      if(!el){ _warn('container not found: '+containerId); return; }
      var _viewTimer=null;
      var fire=function(){
        try{
          el.innerHTML='';
          var s=_buildZoneScript(INPAGE.zone, INPAGE.src);
          el.appendChild(s);
          _s.inpageContainers[containerId]=true;
          _log('[KamiAds] In-page injected:',containerId);
        }catch(e){ _warn('inpage inject failed',e); }
      };
      var schedule=function(){ try{ setTimeout(fire, INPAGE_SETTLE_MS); }catch(e){ fire(); } };
      if('IntersectionObserver' in global){
        try{
          var io=new IntersectionObserver(function(entries){
            for(var i=0;i<entries.length;i++){
              if(entries[i].isIntersecting && entries[i].intersectionRatio>=INPAGE_VIS_RATIO){
                if(!_viewTimer){
                  _viewTimer=setTimeout(function(){ io.disconnect(); schedule(); }, INPAGE_VIS_MS);
                }
              } else {
                if(_viewTimer){ clearTimeout(_viewTimer); _viewTimer=null; }
              }
            }
          },{ threshold:[0,INPAGE_VIS_RATIO,1] });
          io.observe(el); return;
        }catch(e){}
      }
      schedule();
    }catch(e){ _warn('loadInPagePush failed',e); }
  }

  /* ── Time-based second slot ── */
  function loadTimedSlot(containerId, delaySec){
    if(_disabled()) return;
    var key='timed_'+containerId;
    if(_s.timedSlots[key]) return;
    _s.timedSlots[key]=true;
    setTimeout(function(){
      loadInPagePush(containerId, true);
      _log('[KamiAds] Timed slot:',containerId);
    }, (delaySec||TIMED_SLOT_DELAY)*1000);
  }

  /* ── Episode interaction trigger ── */
  function onEpisodeChange(){
    if(_disabled()) return;
    var now=_now();
    if(now-_s.episodeAdCooldown<EP_AD_GAP_MS) return;
    _s.episodeAdCooldown=now;
    setTimeout(function(){ loadInPagePush('player-ad',true); }, 1500);
    _log('[KamiAds] Episode ad triggered');
  }

  /* ── Session depth boost ── */
  function onSessionDepth(){
    if(_disabled()) return;
    var now=_now();
    if(now-_s.lastDepthTrigger<DEPTH_MIN_GAP_MS) return;
    _s.lastDepthTrigger=now;
    setTimeout(function(){
      var ap=document.getElementById('animePageView');
      var hv=document.getElementById('homeView');
      if(ap&&(ap.style.display==='flex'||ap.classList.contains('open'))){
        loadInPagePush('player-ad',true);
      } else if(hv&&hv.style.display!=='none'){
        loadInPagePush('home-ad',true);
      }
      _log('[KamiAds] Session depth triggered');
    }, 800);
  }

  /* ── Dynamic feed pattern ── */
  var _feedNextAdAt=0;
  function _nextGap(){ var r=Math.random(); return r<0.30?2:r<0.85?3:4; }
  function _resetFeedPattern(){ _feedNextAdAt=_nextGap(); }
  _resetFeedPattern();
  function shouldInsertFeedAd(idx){
    if(idx===_feedNextAdAt){ _feedNextAdAt+=_nextGap(); return true; } return false;
  }
  function createFeedAdNode(){
    var wrap=document.createElement('div');
    try{
      var slotId='kami-feed-ad-'+Math.random().toString(36).slice(2,9);
      wrap.className='cf-slide kami-feed-ad';
      wrap.dataset.kamiAd='feed';
      wrap.style.cssText='background:linear-gradient(160deg,#1a0030,#0a001a,#001428);position:relative;display:flex;align-items:center;justify-content:center;scroll-snap-align:start;';
      wrap.innerHTML=
        '<div style="position:absolute;top:14px;left:14px;font-size:10px;letter-spacing:1px;text-transform:uppercase;color:rgba(255,255,255,0.45);font-weight:700;">Sponsored</div>'+
        '<div id="'+slotId+'" style="width:100%;max-width:340px;min-height:220px;display:flex;align-items:center;justify-content:center;padding:24px;color:rgba(255,255,255,0.45);font-size:12px;">Sponsored content</div>';
      setTimeout(function(){ loadInPagePush(slotId); }, 0);
    }catch(e){ _warn('createFeedAdNode failed',e); }
    return wrap;
  }

  /* ── Kill switch & diagnostics ── */
  function disable(){ global.__KAMI_ADS_DISABLE=true; _log('[KamiAds] Disabled'); }
  function _diag(){
    return {
      prod:_isProd(),disabled:_disabled(),geoTier:_s.geoTier,
      clickCount:_s.clickCount,popCooledDown:_popCooledDown(),
      lastPop:_lsGet(POP_LS_KEY),inpageContainers:Object.keys(_s.inpageContainers),
      feedNextAdAt:_feedNextAdAt
    };
  }

  /* ── Auto-init ── */
  function _ready(fn){
    if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',fn,{once:true});
    else fn();
  }
  _ready(function(){
    try{ _detectGeo(); }catch(e){}
    try{ initOverlayAds(); }catch(e){}
  });

  /* ── Public API ── */
  global.KamiAds = {
    /* v6 */
    initOverlayAds:     initOverlayAds,
    applyOverlays:      _applyOverlays,
    loadInPagePush:     loadInPagePush,
    loadTimedSlot:      loadTimedSlot,
    onEpisodeChange:    onEpisodeChange,
    onSessionDepth:     onSessionDepth,
    shouldInsertFeedAd: shouldInsertFeedAd,
    createFeedAdNode:   createFeedAdNode,
    disable:            disable,
    _diag:              _diag,
    /* v5/v4 shims */
    initPopunderOnce:   initOverlayAds,
    initPopunder:       initOverlayAds,
    initPush:           function(){},
    initInPagePush:     function(){
      try{
        if(document.getElementById('home-ad'))    loadInPagePush('home-ad');
        if(document.getElementById('player-ad'))  loadInPagePush('player-ad');
        if(document.getElementById('sidebar-ad')) loadInPagePush('sidebar-ad');
      }catch(e){}
    },
    loadNativeAd:       function(id){ try{ loadInPagePush(id); }catch(e){} },
    loadSidebarAd:      function(){ try{ loadInPagePush('sidebar-ad'); }catch(e){} },
    injectFeedAd:       createFeedAdNode,
    maybeShowVignette:  function(){ return false; },
    reportPageview:     function(){},
    reportWatchSecond:  function(){},
    showDebug:          function(){ try{ console.log('[KamiAds]',_diag()); }catch(e){} },
    state:              _s,
    config:             { popunder:POPUNDER, inpagePush:INPAGE }
  };

})(window);

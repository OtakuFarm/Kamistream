/* ════════════════════════════════════════════════════════════════════════
 * KamiStream — Ads Manager (v5, intelligent monetization)
 * ────────────────────────────────────────────────────────────────────────
 * Two ad types — Monetag Onclick (Popunder) + In-Page Push.
 *
 *   Popunder        zone 10936606   https://al5sm.com/tag.min.js
 *   In-Page Push    zone 10937463   https://nap5k.com/tag.min.js
 *
 * v5 upgrades:
 *   STEP 1 — Smart popunder: 5-min localStorage cooldown. Active users
 *             (3+ clicks) qualify for second pop after cooldown.
 *   STEP 2 — Time-based second slot: fires 25s after page load, once/session.
 *   STEP 3 — Dynamic feed pattern: weighted 2/3/4 gap, min gap = 2.
 *   STEP 4 — Episode interaction trigger: reloads player-ad on ep/server switch.
 *   STEP 5 — Session depth boost: ad check on autoplay/CW/rec, 2-min gap.
 *   STEP 6 — Geo-aware cooldown: T1 countries get 4-min cooldown vs 5-min.
 *   STEP 7 — Safety: viewability guard (2s), duplicate injection prevention,
 *             per-session flags, global kill switch.
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

  /* ── STEP 7 — constants ── */
  var POP_COOLDOWN_MS   = 5 * 60 * 1000;  /* 5-min default cooldown */
  var POP_ACTIVE_CLICKS = 3;               /* clicks to qualify as active user */
  var TIMED_SLOT_DELAY  = 25;             /* seconds before timed slot fires */
  var DEPTH_MIN_GAP_MS  = 2 * 60 * 1000; /* 2-min gap between depth triggers */
  var EP_AD_GAP_MS      = 60 * 1000;     /* 60s between episode ad reloads */
  var INPAGE_SETTLE_MS  = 1200;
  var INPAGE_VIS_RATIO  = 0.25;
  var INPAGE_VIS_MS     = 2000;           /* STEP 7 — 2s viewability before inject */
  var POPUNDER_DEFER_MS = 250;

  var EPISODE_SKIP = '.ep-card,.ep-source-pill,#apIframe,.ap-src-btn,.ap-now-btn';

  /* Session state */
  var _s = {
    popunderArmed:     false,
    clickCount:        0,
    inpageContainers:  {},
    timedSlots:        {},
    lastDepthTrigger:  0,
    episodeAdCooldown: 0,
    geoTier:           null
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

  /* ─────────────────────────────────────────────────────────────────────
   * STEP 6 — GEO DETECTION (one fetch, cached in sessionStorage)
   * ───────────────────────────────────────────────────────────────────── */
  var TIER1 = {
    US:1,GB:1,CA:1,AU:1,DE:1,FR:1,NL:1,SE:1,NO:1,DK:1,
    FI:1,CH:1,AT:1,BE:1,IE:1,NZ:1,SG:1,JP:1,KR:1
  };

  function _detectGeo(){
    var cached = _ssGet('kami_geo_tier');
    if(cached){ _s.geoTier=cached; return; }
    try{
      fetch('https://ipapi.co/country/',{cache:'force-cache'})
        .then(function(r){ return r.text(); })
        .then(function(c){
          var tier = TIER1[(c||'').trim().toUpperCase()] ? 'T1' : 'T3';
          _s.geoTier=tier; _ssSet('kami_geo_tier',tier);
          _log('[KamiAds] Geo tier:',tier);
        }).catch(function(){ _s.geoTier='T3'; });
    }catch(e){ _s.geoTier='T3'; }
  }

  function _popCooldown(){
    /* T1 users get 4-min cooldown, everyone else 5-min */
    return _s.geoTier==='T1' ? 4*60*1000 : POP_COOLDOWN_MS;
  }

  /* ─────────────────────────────────────────────────────────────────────
   * STEP 1 — SMART POPUNDER with 5-min cooldown + active user logic
   * ───────────────────────────────────────────────────────────────────── */
  var POP_LS_KEY = 'kami_lastPopTime';

  function _popCooledDown(){
    var last = parseInt(_lsGet(POP_LS_KEY)||'0');
    return (_now()-last) >= _popCooldown();
  }

  function _firePop(){
    setTimeout(function(){
      try{
        /* STEP 7 — remove stale popunder script before re-injecting */
        var old = document.querySelector('script[data-zone="'+POPUNDER.zone+'"]');
        if(old) old.remove();

        var s = _buildZoneScript(POPUNDER.zone, POPUNDER.src);
        document.body.appendChild(s);
        _lsSet(POP_LS_KEY, String(_now()));
        _log('[KamiAds] Popunder fired. Clicks this session:', _s.clickCount);

        /* Restore site interactivity 300ms after script injection */
        setTimeout(function(){
          try{ if(typeof global.__kamiRestoreSite==='function') global.__kamiRestoreSite(); }catch(e){}
        }, 300);
      }catch(e){ _warn('popunder inject failed',e); }
    }, POPUNDER_DEFER_MS);
  }

  function initPopunderOnce(){
    if(_disabled()) return;
    if(_s.popunderArmed) return;
    _s.popunderArmed = true;

    var handler = function(ev){
      _s.clickCount++;

      /* Skip episode player — don't break iframe load */
      try{
        var node=ev.target;
        while(node&&node.nodeType!==1) node=node.parentNode;
        if(node&&node.closest&&node.closest(EPISODE_SKIP)) return;
      }catch(e){}

      /* STEP 1 — cooldown check */
      if(!_popCooledDown()) return;

      /* STEP 1 — if user has popped before, require 3+ clicks to qualify again */
      var last = parseInt(_lsGet(POP_LS_KEY)||'0');
      if(last > 0 && _s.clickCount < POP_ACTIVE_CLICKS) return;

      _firePop();
    };

    document.addEventListener('click',      handler, false);
    document.addEventListener('touchstart', handler, { passive:true, capture:false });
  }

  /* ─────────────────────────────────────────────────────────────────────
   * STEP 7 — IN-PAGE PUSH with viewability + duplicate guard
   * ───────────────────────────────────────────────────────────────────── */
  function loadInPagePush(containerId, force){
    if(_disabled()) return;
    try{
      if(!containerId) return;

      /* STEP 7 — skip already-injected slots unless forced */
      if(!force && _s.inpageContainers[containerId]){
        _log('[KamiAds] Already injected, skip:',containerId);
        return;
      }

      var el = document.getElementById(containerId);
      if(!el){ _warn('container not found: '+containerId); return; }

      var _viewTimer = null;

      var fire = function(){
        try{
          el.innerHTML='';
          var s=_buildZoneScript(INPAGE.zone, INPAGE.src);
          el.appendChild(s);
          _s.inpageContainers[containerId]=true;
          _log('[KamiAds] In-page injected:',containerId);
        }catch(e){ _warn('inpage inject failed',e); }
      };

      var schedule = function(){
        try{ setTimeout(fire, INPAGE_SETTLE_MS); }catch(e){ fire(); }
      };

      if('IntersectionObserver' in global){
        try{
          var io = new IntersectionObserver(function(entries){
            for(var i=0;i<entries.length;i++){
              if(entries[i].isIntersecting && entries[i].intersectionRatio>=INPAGE_VIS_RATIO){
                /* STEP 7 — must stay visible 2s before we inject */
                if(!_viewTimer){
                  _viewTimer=setTimeout(function(){
                    io.disconnect();
                    schedule();
                  }, INPAGE_VIS_MS);
                }
              } else {
                if(_viewTimer){ clearTimeout(_viewTimer); _viewTimer=null; }
              }
            }
          },{ threshold:[0,INPAGE_VIS_RATIO,1] });
          io.observe(el);
          return;
        }catch(e){}
      }
      schedule();
    }catch(e){ _warn('loadInPagePush failed',e); }
  }

  /* ─────────────────────────────────────────────────────────────────────
   * STEP 2 — TIME-BASED SECOND SLOT (once per session per slot)
   * Call: KamiAds.loadTimedSlot('home-ad-2') from homepage init
   *       KamiAds.loadTimedSlot('player-ad-2') from watch page init
   * ───────────────────────────────────────────────────────────────────── */
  function loadTimedSlot(containerId, delaySec){
    if(_disabled()) return;
    var delay=(delaySec||TIMED_SLOT_DELAY)*1000;
    var key='timed_'+containerId;

    /* STEP 7 — once per session */
    if(_s.timedSlots[key]) return;
    _s.timedSlots[key]=true;

    setTimeout(function(){
      loadInPagePush(containerId, true);
      _log('[KamiAds] Timed slot fired:',containerId);
    }, delay);
  }

  /* ─────────────────────────────────────────────────────────────────────
   * STEP 4 — EPISODE INTERACTION TRIGGER
   * Hook: call KamiAds.onEpisodeChange() inside playEpisode wrapper
   * ───────────────────────────────────────────────────────────────────── */
  function onEpisodeChange(){
    if(_disabled()) return;
    var now=_now();
    if(now-_s.episodeAdCooldown < EP_AD_GAP_MS) return;
    _s.episodeAdCooldown=now;

    /* 1.5s delay — iframe starts loading before ad injects */
    setTimeout(function(){
      loadInPagePush('player-ad', true);
      _log('[KamiAds] Episode ad triggered');
    }, 1500);
  }

  /* ─────────────────────────────────────────────────────────────────────
   * STEP 5 — SESSION DEPTH BOOST
   * Hook: call KamiAds.onSessionDepth() from autoplay, CW clicks, rec clicks
   * ───────────────────────────────────────────────────────────────────── */
  function onSessionDepth(){
    if(_disabled()) return;
    var now=_now();
    if(now-_s.lastDepthTrigger < DEPTH_MIN_GAP_MS) return;
    _s.lastDepthTrigger=now;

    setTimeout(function(){
      var apView  = document.getElementById('animePageView');
      var homeView= document.getElementById('homeView');

      if(apView && (apView.style.display==='flex'||apView.classList.contains('open'))){
        loadInPagePush('player-ad', true);
      } else if(homeView && homeView.style.display!=='none'){
        loadInPagePush('home-ad', true);
      }
      _log('[KamiAds] Session depth ad triggered');
    }, 800);
  }

  /* ─────────────────────────────────────────────────────────────────────
   * STEP 3 — DYNAMIC FEED AD PATTERN
   * Weighted gap: 30% → 2 items, 55% → 3 items, 15% → 4 items.
   * shouldInsertFeedAd(idx) replaces the old (idx+1)%3===0 check.
   * ───────────────────────────────────────────────────────────────────── */
  var _feedNextAdAt = 0;

  function _nextGap(){
    var r=Math.random();
    if(r<0.30) return 2;
    if(r<0.85) return 3;
    return 4;
  }

  /* Reset pattern when feed reloads */
  function _resetFeedPattern(){ _feedNextAdAt=_nextGap(); }
  _resetFeedPattern();

  /* Returns true when an ad should be inserted at this index */
  function shouldInsertFeedAd(idx){
    if(idx===_feedNextAdAt){
      _feedNextAdAt += _nextGap();
      return true;
    }
    return false;
  }

  function createFeedAdNode(){
    var wrap=document.createElement('div');
    try{
      var slotId='kami-feed-ad-'+Math.random().toString(36).slice(2,9);
      wrap.className='cf-slide kami-feed-ad';
      wrap.dataset.kamiAd='feed';
      wrap.style.cssText=[
        'background:linear-gradient(160deg,#1a0030,#0a001a,#001428)',
        'position:relative','display:flex',
        'align-items:center','justify-content:center',
        'scroll-snap-align:start'
      ].join(';');
      wrap.innerHTML=
        '<div style="position:absolute;top:14px;left:14px;font-size:10px;letter-spacing:1px;'+
        'text-transform:uppercase;color:rgba(255,255,255,0.45);font-weight:700;">Sponsored</div>'+
        '<div id="'+slotId+'" style="width:100%;max-width:340px;min-height:220px;'+
        'display:flex;align-items:center;justify-content:center;padding:24px;'+
        'color:rgba(255,255,255,0.45);font-size:12px;">Sponsored content</div>';
      setTimeout(function(){ loadInPagePush(slotId); }, 0);
    }catch(e){ _warn('createFeedAdNode failed',e); }
    return wrap;
  }

  /* ── Kill switch & diagnostics ── */
  function disable(){ global.__KAMI_ADS_DISABLE=true; _log('[KamiAds] Disabled'); }
  function _diag(){
    return {
      prod:_isProd(), admin:_isAdmin(), disabled:_disabled(), host:location.hostname,
      geoTier:_s.geoTier, clickCount:_s.clickCount, popCooledDown:_popCooledDown(),
      lastPop:_lsGet(POP_LS_KEY), inpageContainers:Object.keys(_s.inpageContainers),
      timedSlots:Object.keys(_s.timedSlots), feedNextAdAt:_feedNextAdAt,
      lastDepthTrigger:_s.lastDepthTrigger
    };
  }

  /* ── Auto-init ── */
  function _ready(fn){
    if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',fn,{once:true});
    else fn();
  }
  _ready(function(){
    try{ _detectGeo(); }catch(e){}
    try{ initPopunderOnce(); }catch(e){}
  });

  /* ── Public API + v1/v4 backward-compat shims ── */
  global.KamiAds = {
    /* v5 */
    initPopunderOnce:   initPopunderOnce,
    loadInPagePush:     loadInPagePush,
    loadTimedSlot:      loadTimedSlot,
    onEpisodeChange:    onEpisodeChange,
    onSessionDepth:     onSessionDepth,
    shouldInsertFeedAd: shouldInsertFeedAd,
    createFeedAdNode:   createFeedAdNode,
    disable:            disable,
    _diag:              _diag,
    /* v4 shims */
    initPopunder:       initPopunderOnce,
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

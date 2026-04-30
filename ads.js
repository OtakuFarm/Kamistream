/* ════════════════════════════════════════════════════════════════════════
 * KamiStream — Ads Manager (v7, clean)
 * ────────────────────────────────────────────────────────────────────────
 * Popunder     zone 10944552   https://al5sm.com/tag.min.js
 * In-Page Push zone 10937463   https://nap5k.com/tag.min.js
 *
 * How the popunder works:
 *   Monetag's script is loaded ONCE on page load.
 *   Their script registers its own document click listener and opens
 *   the popunder tab when the browser allows it.
 *   We do NOT re-inject their script on every click — that was wrong.
 *
 * In-page push:
 *   Injected into named container divs via IntersectionObserver.
 *   Once per container per session unless forced.
 * ════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var POPUNDER = { zone: '10944552', src: 'https://al5sm.com/tag.min.js' };
  var INPAGE   = { zone: '10937463', src: 'https://nap5k.com/tag.min.js' };

  var PROD_HOSTS = [
    'kamistream.tv',  'www.kamistream.tv',
    'kamistream.fun', 'www.kamistream.fun',
    'kamistream.com', 'www.kamistream.com'
  ];

  var INPAGE_SETTLE_MS = 1200;
  var INPAGE_VIS_RATIO = 0.25;
  var INPAGE_VIS_MS    = 2000;
  var TIMED_SLOT_DELAY = 25;
  var DEPTH_MIN_GAP_MS = 2 * 60 * 1000;
  var EP_AD_GAP_MS     = 60 * 1000;

  var _s = {
    popLoaded:         false,
    inpageContainers:  {},
    timedSlots:        {},
    lastDepthTrigger:  0,
    episodeAdCooldown: 0
  };

  /* ── Helpers ── */
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
  function _ssGet(k){ try{ return sessionStorage.getItem(k); }catch(e){ return null; } }
  function _ssSet(k,v){ try{ sessionStorage.setItem(k,v); }catch(e){} }

  function _buildScript(zone, src){
    var s=document.createElement('script');
    s.src=src; s.async=true;
    s.dataset.zone=zone;
    s.setAttribute('data-cfasync','false');
    return s;
  }

  /* ════════════════════════════════════════════════════════════════
   * POPUNDER — load Monetag script ONCE at page init.
   * Their script handles click detection and popup opening itself.
   * ════════════════════════════════════════════════════════════════ */
  function loadPopunder(){
    if(_disabled()) return;
    if(_s.popLoaded) return;
    if(_ssGet('kami_pop_loaded')) return; /* already loaded this session */

    _s.popLoaded = true;
    _ssSet('kami_pop_loaded','1');

    try{
      /* Monetag's exact injection pattern from the dashboard */
      (function(s){
        s.dataset.zone = POPUNDER.zone;
        s.src = POPUNDER.src;
      })(
        [document.documentElement, document.body]
          .filter(Boolean).pop()
          .appendChild(document.createElement('script'))
      );
      _log('[KamiAds] Popunder script loaded. Zone:', POPUNDER.zone);
    }catch(e){ _warn('loadPopunder failed',e); }
  }

  /* ════════════════════════════════════════════════════════════════
   * IN-PAGE PUSH
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
          var s=_buildScript(INPAGE.zone, INPAGE.src);
          el.appendChild(s);
          _s.inpageContainers[containerId]=true;
          _log('[KamiAds] In-page injected:',containerId);
        }catch(e){ _warn('inpage inject failed',e); }
      };

      var schedule=function(){
        try{ setTimeout(fire, INPAGE_SETTLE_MS); }catch(e){ fire(); }
      };

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
          io.observe(el);
          return;
        }catch(e){}
      }
      schedule();
    }catch(e){ _warn('loadInPagePush failed',e); }
  }

  /* ── Time-based second slot (once per session) ── */
  function loadTimedSlot(containerId, delaySec){
    if(_disabled()) return;
    var key='timed_'+containerId;
    if(_s.timedSlots[key]) return;
    _s.timedSlots[key]=true;
    setTimeout(function(){
      loadInPagePush(containerId, true);
    }, (delaySec||TIMED_SLOT_DELAY)*1000);
  }

  /* ── Episode interaction trigger ── */
  function onEpisodeChange(){
    if(_disabled()) return;
    var now=_now();
    if(now-_s.episodeAdCooldown<EP_AD_GAP_MS) return;
    _s.episodeAdCooldown=now;
    setTimeout(function(){ loadInPagePush('player-ad',true); }, 1500);
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
    }, 800);
  }

  /* ── Dynamic feed pattern ── */
  var _feedNextAdAt=0;
  function _nextGap(){ var r=Math.random(); return r<0.30?2:r<0.85?3:4; }
  (function(){ _feedNextAdAt=_nextGap(); })();

  function shouldInsertFeedAd(idx){
    if(idx===_feedNextAdAt){ _feedNextAdAt+=_nextGap(); return true; }
    return false;
  }

  function createFeedAdNode(){
    var wrap=document.createElement('div');
    try{
      var slotId='kami-feed-ad-'+Math.random().toString(36).slice(2,9);
      wrap.className='cf-slide kami-feed-ad';
      wrap.style.cssText='background:linear-gradient(160deg,#1a0030,#0a001a,#001428);position:relative;display:flex;align-items:center;justify-content:center;scroll-snap-align:start;';
      wrap.innerHTML=
        '<div style="position:absolute;top:14px;left:14px;font-size:10px;letter-spacing:1px;'+
        'text-transform:uppercase;color:rgba(255,255,255,0.45);font-weight:700;">Sponsored</div>'+
        '<div id="'+slotId+'" style="width:100%;max-width:340px;min-height:220px;display:flex;'+
        'align-items:center;justify-content:center;padding:24px;color:rgba(255,255,255,0.45);font-size:12px;">'+
        'Sponsored content</div>';
      setTimeout(function(){ loadInPagePush(slotId); }, 0);
    }catch(e){ _warn('createFeedAdNode failed',e); }
    return wrap;
  }

  /* ── Kill switch ── */
  function disable(){ global.__KAMI_ADS_DISABLE=true; }
  function _diag(){
    return {
      prod:_isProd(), disabled:_disabled(),
      popLoaded:_s.popLoaded,
      inpageContainers:Object.keys(_s.inpageContainers)
    };
  }

  /* ── Auto-init ── */
  function _ready(fn){
    if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',fn,{once:true});
    else fn();
  }
  _ready(function(){
    try{ loadPopunder(); }catch(e){}
  });

  /* ── Public API ── */
  global.KamiAds = {
    loadPopunder:       loadPopunder,
    loadInPagePush:     loadInPagePush,
    loadTimedSlot:      loadTimedSlot,
    onEpisodeChange:    onEpisodeChange,
    onSessionDepth:     onSessionDepth,
    shouldInsertFeedAd: shouldInsertFeedAd,
    createFeedAdNode:   createFeedAdNode,
    disable:            disable,
    _diag:              _diag,
    /* shims */
    initPopunderOnce:   loadPopunder,
    initPopunder:       loadPopunder,
    initOverlayAds:     loadPopunder,
    applyOverlays:      function(){},
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

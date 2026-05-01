/* ════════════════════════════════════════════════════════════════════════
 * KamiStream — Ads Manager (v9)
 * ────────────────────────────────────────────────────────────────────────
 * Popunder     zones: 10936622, 10937524
 * In-Page Push zone:  10937463   https://nap5k.com/tag.min.js
 *
 * v9 additions:
 *   · Episode click ads — fires popunder when user clicks:
 *       - Episode list items in the sidebar
 *       - Next / Prev episode buttons
 *       - The player iframe area (first interaction)
 *   · Shared cooldown with card pops (no double-firing)
 * ════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var POP_URLS = [
    'https://omg10.com/4/10936622',
    'https://omg10.com/4/10937524'
  ];
  var _popIndex = 0;
  function _nextPopUrl(){
    var url = POP_URLS[_popIndex % POP_URLS.length];
    _popIndex++;
    return url;
  }

  var INPAGE = { zone: '10937463', src: 'https://nap5k.com/tag.min.js' };

  var PROD_HOSTS = [
    'kamistream.tv',  'www.kamistream.tv',
    'kamistream.fun', 'www.kamistream.fun',
    'kamistream.com', 'www.kamistream.com'
  ];

  var POP_LS_KEY       = 'kami_lastPopTime';
  var POP_COOLDOWN_MS  = 30 * 1000;
  var POP_T1_MS        = 20 * 1000;
  var EP_CLICK_GAP_MS  = 45 * 1000;  // separate cooldown for episode clicks
  var INPAGE_SETTLE_MS = 1200;
  var INPAGE_VIS_RATIO = 0.25;
  var INPAGE_VIS_MS    = 2000;
  var EP_AD_GAP_MS     = 60 * 1000;
  var DEPTH_MIN_GAP_MS = 2 * 60 * 1000;
  var TIMED_SLOT_DELAY = 25;

  var CARD_SELECTORS = [
    '.tr-card','.cw-card','.bfv-card',
    '.rel-card','.ru-card','.pw-item','.wl-card'
  ].join(',');

  // Episode page selectors
  var EP_NAV_SELECTORS = [
    '[data-ep-nav]',          // prev/next buttons (we'll add this attr)
    '[data-ep-item]',         // episode list items
  ].join(',');

  var _s = {
    overlayArmed:      false,
    overlayObserver:   null,
    epObserver:        null,
    inpageContainers:  {},
    timedSlots:        {},
    lastDepthTrigger:  0,
    episodeAdCooldown: 0,
    lastEpClickPop:    0,
    geoTier:           null
  };

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

  function _buildScript(zone, src){
    var s=document.createElement('script');
    s.src=src; s.async=true; s.dataset.zone=zone;
    s.setAttribute('data-cfasync','false');
    return s;
  }

  var TIER1={US:1,GB:1,CA:1,AU:1,DE:1,FR:1,NL:1,SE:1,NO:1,DK:1,FI:1,CH:1,AT:1,BE:1,IE:1,NZ:1,SG:1,JP:1,KR:1};
  function _detectGeo(){
    var c=_ssGet('kami_geo');
    if(c){ _s.geoTier=c; return; }
    try{
      fetch('https://ipapi.co/country/',{cache:'force-cache'})
        .then(function(r){return r.text();})
        .then(function(c){
          var t=TIER1[(c||'').trim().toUpperCase()]?'T1':'T3';
          _s.geoTier=t; _ssSet('kami_geo',t);
        }).catch(function(){ _s.geoTier='T3'; });
    }catch(e){ _s.geoTier='T3'; }
  }
  function _cooldown(){ return _s.geoTier==='T1'?POP_T1_MS:POP_COOLDOWN_MS; }
  function _cooledDown(){
    return (_now()-parseInt(_lsGet(POP_LS_KEY)||'0')) >= _cooldown();
  }
  function _epClickCooledDown(){
    return (_now() - _s.lastEpClickPop) >= EP_CLICK_GAP_MS;
  }

  /* ── Core popunder ── */
  function _openPop(){
    try{
      var url = _nextPopUrl();
      var w = window.open(url, '_blank');
      if(w){ w.opener=null; }
      window.focus();
      _lsSet(POP_LS_KEY, String(_now()));
      _log('[KamiAds] Pop opened:', url);
    }catch(e){ _warn('pop failed',e); }
  }

  /* ── Card clicks (home / browse) ── */
  function _wrapCard(card){
    if(card._kamiWrapped) return;
    card._kamiWrapped = true;
    card.addEventListener('click', function(){
      if(_disabled()) return;
      if(!_cooledDown()) return;
      _openPop();
    }, false);
  }

  function _applyToCards(root){
    if(_disabled()) return;
    root = root || document;
    try{
      var cards = root.querySelectorAll(CARD_SELECTORS);
      for(var i=0;i<cards.length;i++) _wrapCard(cards[i]);
    }catch(e){ _warn('applyToCards failed',e); }
  }

  /* ════════════════════════════════════════════════════════════════
   * EPISODE CLICK ADS
   * Called by watch.tsx via KamiAds.onEpisodeClick()
   * Fires a popunder when:
   *   - User clicks an episode in the sidebar list
   *   - User clicks Prev / Next episode
   *   - User clicks anywhere on the player for the first time per episode
   * Uses its own 45s cooldown on top of the shared pop cooldown.
   * ════════════════════════════════════════════════════════════════ */
  function onEpisodeClick(type){
    if(_disabled()) return;
    if(!_cooledDown()) return;
    if(!_epClickCooledDown()) return;
    _s.lastEpClickPop = _now();
    _openPop();
    _log('[KamiAds] Episode click ad fired, type:', type||'unknown');
  }

  /* ── Watch for episode nav/list elements added by React ── */
  function _wrapEpElement(el){
    if(el._kamiEpWrapped) return;
    el._kamiEpWrapped = true;
    el.addEventListener('click', function(){
      if(_disabled()) return;
      onEpisodeClick('nav');
    }, false);
  }

  function _applyToEpElements(root){
    if(_disabled()) return;
    root = root || document;
    try{
      var els = root.querySelectorAll(EP_NAV_SELECTORS);
      for(var i=0;i<els.length;i++) _wrapEpElement(els[i]);
    }catch(e){}
  }

  function _watchEpElements(){
    if(_s.epObserver) return;
    if(!('MutationObserver' in global)) return;
    var debounce=null;
    _s.epObserver = new MutationObserver(function(){
      clearTimeout(debounce);
      debounce = setTimeout(function(){ _applyToEpElements(); }, 150);
    });
    _s.epObserver.observe(document.body,{childList:true,subtree:true});
  }

  function _watchCards(){
    if(_s.overlayObserver) return;
    if(!('MutationObserver' in global)) return;
    var debounce=null;
    _s.overlayObserver = new MutationObserver(function(mutations){
      var hasNew=false;
      for(var i=0;i<mutations.length;i++){
        var nodes=mutations[i].addedNodes;
        for(var j=0;j<nodes.length;j++){
          var n=nodes[j];
          if(n.nodeType===1){
            if((n.matches&&n.matches(CARD_SELECTORS))||(n.querySelector&&n.querySelector(CARD_SELECTORS))){
              hasNew=true; break;
            }
          }
        }
        if(hasNew) break;
      }
      if(hasNew){ clearTimeout(debounce); debounce=setTimeout(function(){ _applyToCards(); },120); }
    });
    _s.overlayObserver.observe(document.body,{childList:true,subtree:true});
  }

  function initAds(){
    if(_disabled()) return;
    if(_s.overlayArmed) return;
    _s.overlayArmed=true;
    _applyToCards();
    _applyToEpElements();
    _watchCards();
    _watchEpElements();
    _detectGeo();
  }

  /* ── In-Page Push ── */
  function loadInPagePush(containerId, force){
    if(_disabled()) return;
    try{
      if(!containerId) return;
      if(!force && _s.inpageContainers[containerId]) return;
      var el=document.getElementById(containerId);
      if(!el){ return; }
      var vt=null;
      var fire=function(){
        try{
          el.innerHTML='';
          el.appendChild(_buildScript(INPAGE.zone,INPAGE.src));
          _s.inpageContainers[containerId]=true;
        }catch(e){}
      };
      var schedule=function(){ setTimeout(fire,INPAGE_SETTLE_MS); };
      if('IntersectionObserver' in global){
        try{
          var io=new IntersectionObserver(function(entries){
            for(var i=0;i<entries.length;i++){
              if(entries[i].isIntersecting&&entries[i].intersectionRatio>=INPAGE_VIS_RATIO){
                if(!vt){ vt=setTimeout(function(){ io.disconnect(); schedule(); },INPAGE_VIS_MS); }
              } else { if(vt){ clearTimeout(vt); vt=null; } }
            }
          },{threshold:[0,INPAGE_VIS_RATIO,1]});
          io.observe(el); return;
        }catch(e){}
      }
      schedule();
    }catch(e){}
  }

  function loadTimedSlot(containerId,delaySec){
    if(_disabled()) return;
    var key='timed_'+containerId;
    if(_s.timedSlots[key]) return;
    _s.timedSlots[key]=true;
    setTimeout(function(){ loadInPagePush(containerId,true); },(delaySec||TIMED_SLOT_DELAY)*1000);
  }

  function onEpisodeChange(){
    if(_disabled()) return;
    var now=_now();
    if(now-_s.episodeAdCooldown<EP_AD_GAP_MS) return;
    _s.episodeAdCooldown=now;
    setTimeout(function(){ loadInPagePush('player-ad',true); },1500);
  }

  function onSessionDepth(){
    if(_disabled()) return;
    var now=_now();
    if(now-_s.lastDepthTrigger<DEPTH_MIN_GAP_MS) return;
    _s.lastDepthTrigger=now;
    setTimeout(function(){
      var ap=document.getElementById('animePageView');
      var hv=document.getElementById('homeView');
      if(ap&&(ap.style.display==='flex'||ap.classList.contains('open'))) loadInPagePush('player-ad',true);
      else if(hv&&hv.style.display!=='none') loadInPagePush('home-ad',true);
    },800);
  }

  var _feedNext=0;
  function _gap(){ var r=Math.random(); return r<0.30?2:r<0.85?3:4; }
  (function(){ _feedNext=_gap(); })();
  function shouldInsertFeedAd(idx){ if(idx===_feedNext){ _feedNext+=_gap(); return true; } return false; }
  function createFeedAdNode(){
    var wrap=document.createElement('div');
    try{
      var id='kfa-'+Math.random().toString(36).slice(2,9);
      wrap.className='cf-slide kami-feed-ad';
      wrap.style.cssText='background:linear-gradient(160deg,#1a0030,#0a001a,#001428);position:relative;display:flex;align-items:center;justify-content:center;scroll-snap-align:start;';
      wrap.innerHTML='<div style="position:absolute;top:14px;left:14px;font-size:10px;letter-spacing:1px;text-transform:uppercase;color:rgba(255,255,255,0.45);font-weight:700;">Sponsored</div>'+
        '<div id="'+id+'" style="width:100%;max-width:340px;min-height:220px;display:flex;align-items:center;justify-content:center;padding:24px;color:rgba(255,255,255,0.45);font-size:12px;">Sponsored content</div>';
      setTimeout(function(){ loadInPagePush(id); },0);
    }catch(e){}
    return wrap;
  }

  function disable(){ global.__KAMI_ADS_DISABLE=true; }
  function _diag(){ return {prod:_isProd(),disabled:_disabled(),geoTier:_s.geoTier,cooledDown:_cooledDown(),epCooledDown:_epClickCooledDown(),containers:Object.keys(_s.inpageContainers)}; }

  function _ready(fn){ if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',fn,{once:true}); else fn(); }
  _ready(function(){ try{ initAds(); }catch(e){} });

  global.KamiAds={
    loadInPagePush:loadInPagePush, loadTimedSlot:loadTimedSlot,
    onEpisodeChange:onEpisodeChange, onEpisodeClick:onEpisodeClick,
    onSessionDepth:onSessionDepth,
    shouldInsertFeedAd:shouldInsertFeedAd, createFeedAdNode:createFeedAdNode,
    disable:disable, _diag:_diag,
    initPopunderOnce:initAds, initPopunder:initAds, initOverlayAds:initAds,
    applyOverlays:function(){}, initPush:function(){},
    initInPagePush:function(){
      try{
        if(document.getElementById('home-ad'))   loadInPagePush('home-ad');
        if(document.getElementById('player-ad')) loadInPagePush('player-ad');
        if(document.getElementById('sidebar-ad'))loadInPagePush('sidebar-ad');
      }catch(e){}
    },
    loadNativeAd:function(id){ try{ loadInPagePush(id); }catch(e){} },
    loadSidebarAd:function(){ try{ loadInPagePush('sidebar-ad'); }catch(e){} },
    injectFeedAd:createFeedAdNode,
    maybeShowVignette:function(){ return false; },
    reportPageview:function(){}, reportWatchSecond:function(){},
    showDebug:function(){ try{ console.log('[KamiAds]',_diag()); }catch(e){} },
    state:_s, config:{inpagePush:INPAGE}
  };

})(window);

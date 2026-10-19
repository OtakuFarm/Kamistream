// ═══════════════════════════════════════════════════════════════════════════════
// CSV BATCH IMPORT — client-side; reads Supabase + local library first to skip duplicates
// ═══════════════════════════════════════════════════════════════════════════════
async function jaiCsvImport(){
  const raw = document.getElementById('jaiCsvInput').value.trim();
  if(!raw){ showToast('Please paste or type MAL IDs','warn'); return; }
  const ids = [...new Set(raw.split(/[,\s]+/).map(s=>Number(s.trim())).filter(n=>n&&Number.isInteger(n)))];
  if(ids.length===0){ showToast('No valid MAL IDs found','err'); return; }

  const sb = getSB();
  if(!sb){ showToast('Supabase not connected — save your URL & key in Settings first','err'); showView('settings'); return; }

  const preview = document.getElementById('jaiCsvPreview');
  const previewList = document.getElementById('jaiCsvPreviewList');
  const count = document.getElementById('jaiCsvCount');
  preview.style.display='block';
  count.textContent = ids.length + ' MAL ID' + (ids.length>1?'s':'') + ' found';
  previewList.innerHTML = ids.slice(0,5).map(n=>'<div>MAL #'+n+'</div>').join('');
  if(ids.length>5) previewList.innerHTML += '<div style="color:var(--text3);font-size:11px;">+ '+(ids.length-5)+' more</div>';

  const statusEl = document.getElementById('jaiCsvStatus');
  statusEl.style.display='block';
  statusEl.innerHTML = '<div class="jai-loading" style="margin-bottom:8px;">⏳ Reading existing titles from Supabase…</div>';
  statusEl.scrollIntoView({behavior:'smooth',block:'center'});
  showToast('⏳ Checking '+ids.length+' IDs against your library…','info');

  try{
    // ── 1. DEDUP #1: local auto-import library (localStorage) ──
    const lsIds = new Set(jaiGetAll().map(a=>Number(a.mal_id)));

    // ── 2. DEDUP #2: read what is ALREADY in the Supabase `anime` table ──
    const sbIds = new Set();
    for(let i=0;i<ids.length;i+=500){
      const {data, error} = await sb.from('anime').select('mal_id').in('mal_id', ids.slice(i,i+500));
      if(error) throw new Error('Supabase lookup failed: '+error.message);
      (data||[]).forEach(r=>{ if(r.mal_id!=null) sbIds.add(Number(r.mal_id)); });
    }
    const isDup = id => lsIds.has(id) || sbIds.has(id);
    const newIds = ids.filter(id=>!isDup(id));
    const dupIds = ids.filter(isDup);

    let html = '<div style="margin-bottom:8px;">📋 <b>'+ids.length+'</b> pasted — <span style="color:#06d6a0;">'+newIds.length+' new</span>'+
      (dupIds.length ? ' · <span style="color:var(--gold);">'+dupIds.length+' already imported (skipped)</span>' : '')+'</div>';
    if(dupIds.length){
      html += '<div style="font-size:11px;color:var(--text3);margin-bottom:8px;">Already in library: '+dupIds.slice(0,20).join(', ')+(dupIds.length>20?' +'+(dupIds.length-20)+' more':'')+'</div>';
    }
    statusEl.innerHTML = html;
    if(newIds.length===0){
      showToast('✅ All '+ids.length+' titles already imported — nothing to do','ok');
      jaiAddLog('📥 CSV import: '+ids.length+' pasted — all already in library');
      return;
    }

    // ── 3. Import the NEW titles only (Jikan → localStorage + Supabase) ──
    const res = {imported:0, dup:0, failed:0};
    const failedIds = [];
    for(let i=0;i<newIds.length;i++){
      const id = newIds[i];
      statusEl.innerHTML = html+'<div class="jai-loading">⏳ Importing '+(i+1)+'/'+newIds.length+' — MAL #'+id+'</div>';
      const r = await jaiImport(id, true);
      if(r==='imported') res.imported++;
      else if(r==='failed'){ res.failed++; failedIds.push(id); }
      else if(r==='duplicate'||r==='duplicate_supabase') res.dup++;
      if(i<newIds.length-1) await new Promise(done=>setTimeout(done, JAI_DELAY_MS));
    }

    // ── 4. Final report ──
    const skipped = dupIds.length + res.dup;
    const report = '<div style="color:'+(res.imported?'#06d6a0':'var(--gold)')+';">✅ Done — <b>'+res.imported+'</b> imported, '+skipped+' skipped (already in library)'+
      (res.failed ? ' · <span style="color:#ff4757;">'+res.failed+' failed</span>' : '')+'</div>'+
      (failedIds.length ? '<div style="font-size:11px;color:var(--text3);margin-top:6px;">Failed: '+failedIds.join(', ')+'</div>' : '');
    statusEl.innerHTML = html+report;
    showToast('✅ CSV import done: '+res.imported+' new titles'+(skipped?', '+skipped+' skipped':''),'ok');
    jaiAddLog('📥 CSV Batch import: '+ids.length+' pasted → '+res.imported+' imported, '+skipped+' skipped, '+res.failed+' failed');
    addLog('CSV Batch import: '+res.imported+'/'+newIds.length+' new titles imported', res.failed?'red':'green');
    jaiRefreshStats(); jaiRenderLibrary(); jaiStartScheduler();
    await loadLibrary();
  }catch(e){
    statusEl.innerHTML = '<div style="color:#ff4757;">❌ '+e.message+'</div>';
    showToast('❌ CSV import failed: '+e.message,'err');
    console.error('[CSV Import]',e);
  }
}
// ═══════════════════════════════════════════════════════════════════════════════
// AUTO-IMPORT SCHEDULE (Vercel Cron) — computes the next UTC run locally
// ═══════════════════════════════════════════════════════════════════════════════
function jaiFetchSchedule(){
  const hours = Math.max(1, Math.min(48, parseInt(document.getElementById('jaiCronHours')?.value,10)||6));
  if(24 % hours !== 0){
    showToast('⚠️ Use an interval that divides 24 hours (1,2,3,4,6,8,12,24) to match the vercel.json cron `0 */N * * *`','warn');
    return;
  }
  // vercel.json cron runs at 0 */N * * * — i.e. UTC-aligned every N hours
  const now = Date.now();
  const d = new Date();
  const dayStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  let next = null;
  for(let h=0; h<24; h+=hours){
    const t = dayStart + h*3600000;
    if(t > now){ next = t; break; }
  }
  if(next==null) next = dayStart + 24*3600000;
  const utc = new Date(next).toISOString().slice(0,16).replace('T',' ')+' UTC';
  const local = new Date(next).toLocaleString();
  showToast('⏰ Cron every '+hours+'h → next run '+local,'ok');
  jaiAddLog('⏰ Schedule: every '+hours+'h · next '+utc+' (local: '+local+')');
}

// ═══════════════════════════════════════════════════════════════════════════════
// REFRESH METADATA — client-side; targets pasted MAL ids or auto_update rows
// ═══════════════════════════════════════════════════════════════════════════════
async function jaiRefreshMetadata(){
  const raw = document.getElementById('jaiRefreshInput').value.trim();
  const sb = getSB();
  const statusEl = document.getElementById('jaiRefreshStatus');
  statusEl.style.display='block';
  statusEl.scrollIntoView({behavior:'smooth',block:'center'});
  if(!sb){
    statusEl.innerHTML='<div style="color:#ff4757;">❌ Supabase not connected — save your URL & key in Settings first</div>';
    showToast('Supabase not connected','err'); showView('settings'); return;
  }

  try{
    let targets = [], head = '';
    if(raw){
      // Explicit MAL ids — must already exist in the library
      const ids = [...new Set(raw.split(/[,\s]+/).map(s=>Number(s.trim())).filter(n=>n&&Number.isInteger(n)))];
      if(!ids.length){ showToast('No valid MAL IDs','err'); return; }
      statusEl.innerHTML = '<div class="jai-loading" style="margin-bottom:8px;">⏳ Checking library…</div>';
      for(let i=0;i<ids.length;i+=500){
        const {data,error} = await sb.from('anime').select('id, mal_id, title_english, title_romaji').in('mal_id', ids.slice(i,i+500));
        if(error) throw new Error('Supabase lookup failed: '+error.message);
        targets.push(...(data||[]));
      }
      const missing = ids.filter(id=>!targets.some(t=>Number(t.mal_id)===id));
      if(missing.length) head = '<div style="color:var(--gold);margin-bottom:8px;">⚠️ Not in library (skipped): '+missing.slice(0,20).join(', ')+(missing.length>20?' +'+(missing.length-20)+' more':'')+'</div>';
    } else {
      // Batch: every non-finished anime with auto_update=true (same set as the scheduler)
      statusEl.innerHTML = '<div class="jai-loading" style="margin-bottom:8px;">⏳ Loading auto-update titles…</div>';
      const {data,error} = await sb.from('anime').select('id, mal_id, title_english, title_romaji').eq('auto_update',true).neq('status','FINISHED').order('last_checked',{ascending:true,nullsFirst:true});
      if(error) throw new Error(error.message);
      targets = data||[];
    }
    if(!targets.length){
      statusEl.innerHTML = head + '<div style="color:var(--gold);">Nothing to refresh.</div>';
      showToast('Nothing to refresh','warn'); return;
    }

    let ok = 0, failed = 0;
    const failedTitles = [];
    for(let i=0;i<targets.length;i++){
      const t = targets[i];
      const title = t.title_english || t.title_romaji || ('MAL #'+t.mal_id);
      statusEl.innerHTML = head + '<div class="jai-loading">⏳ Refreshing '+(i+1)+'/'+targets.length+' — '+title+'</div>';
      try{
        await jaiSyncOne(Number(t.mal_id));
        ok++;
      }catch(e){
        failed++; failedTitles.push(title); console.warn('[Refresh] MAL #'+t.mal_id, e.message);
      }
      if(i<targets.length-1) await new Promise(done=>setTimeout(done, JAI_DELAY_MS));
    }

    statusEl.innerHTML = head + '<div style="color:#06d6a0;">✅ Refreshed '+ok+'/'+targets.length+' titles'+
      (failed ? ' · <span style="color:#ff4757;">'+failed+' failed</span>' : '')+'</div>'+
      (failedTitles.length ? '<div style="font-size:11px;color:var(--text3);margin-top:6px;">Failed: '+failedTitles.slice(0,10).join(', ')+(failedTitles.length>10?' +'+(failedTitles.length-10)+' more':'')+'</div>' : '');
    showToast('✅ Refresh done: '+ok+'/'+targets.length+' updated','ok');
    jaiAddLog('🔄 Refresh metadata: '+ok+'/'+targets.length+' updated'+(failed?', '+failed+' failed':''));
    document.getElementById('jaiRefreshInput').value='';
    jaiRefreshStats(); jaiRenderLibrary();
    await loadLibrary();
  }catch(e){
    statusEl.innerHTML = '<div style="color:#ff4757;">❌ '+e.message+'</div>';
    showToast('❌ Refresh failed: '+e.message,'err');
    console.error('[Refresh]',e);
  }
}

async function jaiRefreshAutoUpdate(){
  document.getElementById('jaiRefreshInput').value='';
  await jaiRefreshMetadata();
}

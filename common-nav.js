(()=>{
  const BASE='/ai-kiroku-app/';
  const items=[
    ['today','今日',BASE+'dashboard/'],
    ['assignment','担当割当',BASE+'assignment/'],
    ['handoff','申し送り',BASE+'handoff/'],
    ['record','AI記録',BASE],
    ['cashbook','出納帳',BASE+'cashbook/']
  ];
  const SENSITIVE_CACHE_KEYS=['aiKirokuUsers','aiKirokuProfiles','activeOrganizationId'];

  function clearSensitiveCache(){
    try{SENSITIVE_CACHE_KEYS.forEach(key=>localStorage.removeItem(key));}catch(_e){}
  }
  function hasSupabaseAuthToken(){
    try{
      for(let i=0;i<localStorage.length;i++){
        const key=localStorage.key(i)||'';
        if(key.startsWith('sb-')&&key.endsWith('-auth-token')){
          const value=localStorage.getItem(key);
          if(value&&value!=='null'&&value!=='{}') return true;
        }
      }
    }catch(_e){}
    return false;
  }
  function hardenLogout(){
    const original=window.cloudLogout;
    if(typeof original!=='function'||original.__aiSafetyWrapped) return;
    const wrapped=async function(...args){
      clearSensitiveCache();
      return original.apply(this,args);
    };
    wrapped.__aiSafetyWrapped=true;
    window.cloudLogout=wrapped;
  }
  function ensureRecordSaveStatus(){
    let el=document.getElementById('recordSaveStatus');
    if(el) return el;
    const count=document.getElementById('careResultCount');
    if(!count) return null;
    el=document.createElement('div');
    el.id='recordSaveStatus';
    el.className='notice';
    el.setAttribute('role','status');
    el.setAttribute('aria-live','polite');
    count.after(el);
    return el;
  }
  function setRecordSaveStatus(text,isError=false){
    const el=ensureRecordSaveStatus();
    if(!el) return;
    el.textContent=text||'';
    el.style.color=isError?'#b42318':'#667085';
    el.style.fontWeight=text?'700':'';
  }
  function setGenerateButtonsDisabled(disabled){
    document.querySelectorAll('button').forEach(btn=>{
      const text=(btn.textContent||'').trim();
      if(text==='AIで記録作成'||text==='別の文章を作る') btn.disabled=disabled;
    });
  }
  let recordSaveBusy=false;
  function hardenRecordSaving(){
    const originalGenerate=window.generate;
    if(typeof originalGenerate!=='function'||originalGenerate.__aiSafetyWrapped) return;
    const wrapped=async function(...args){
      if(recordSaveBusy) return;
      const saveFn=window.cloudSaveRecord;
      if(typeof saveFn!=='function') return originalGenerate.apply(this,args);

      let capturedRecord=null;
      const currentAddHistory=window.addHistory;
      recordSaveBusy=true;
      setGenerateButtonsDisabled(true);
      window.addHistory=()=>{};
      window.cloudSaveRecord=async record=>{capturedRecord=record;};
      try{
        setRecordSaveStatus('記録文を作成しています…');
        await originalGenerate.apply(this,args);
      }finally{
        window.addHistory=currentAddHistory;
        window.cloudSaveRecord=saveFn;
      }

      try{
        if(!capturedRecord){
          setRecordSaveStatus('');
          return;
        }
        setRecordSaveStatus('クラウド履歴へ保存しています…');
        await saveFn(capturedRecord);
        setRecordSaveStatus('✓ クラウド履歴へ保存しました。');
      }catch(e){
        console.error('AI記録のクラウド保存に失敗しました',e);
        setRecordSaveStatus('保存できていません。通信状態を確認して、もう一度お試しください。',true);
        alert('記録文は作成されましたが、クラウド履歴に保存できていません。通信状態を確認して、もう一度「AIで記録作成」を押してください。');
      }finally{
        recordSaveBusy=false;
        setGenerateButtonsDisabled(false);
      }
    };
    wrapped.__aiSafetyWrapped=true;
    window.generate=wrapped;
  }
  function markShortenedTextUnsaved(){
    const original=window.shortenCareResult;
    if(typeof original!=='function'||original.__aiSafetyWrapped) return;
    const wrapped=function(...args){
      const before=document.getElementById('careResult')?.textContent||'';
      const result=original.apply(this,args);
      const after=document.getElementById('careResult')?.textContent||'';
      if(after&&after!==before){
        setRecordSaveStatus('※ ②を短くした内容は、クラウド履歴にはまだ保存されていません。');
      }
      return result;
    };
    wrapped.__aiSafetyWrapped=true;
    window.shortenCareResult=wrapped;
  }
  function currentKey(){
    const p=location.pathname;
    if(p.includes('/dashboard/')) return 'today';
    if(p.includes('/assignment/')) return 'assignment';
    if(p.includes('/handoff/')) return 'handoff';
    if(p.includes('/cashbook/')) return 'cashbook';
    return 'record';
  }
  function loadPageAddons(){
    if(currentKey()!=='record'||document.getElementById('staffCompactScript')) return;
    const s=document.createElement('script');
    s.id='staffCompactScript';
    s.src=BASE+'staff-compact.js?v=20261008-1';
    document.head.appendChild(s);
  }
  function addStyle(){
    if(document.getElementById('cozyCommonNavStyle')) return;
    const s=document.createElement('style');
    s.id='cozyCommonNavStyle';
    s.textContent=`
      .app-nav.cozy-common-nav{display:flex!important;grid-template-columns:none!important;gap:4px!important;overflow-x:auto!important;max-width:none!important;width:100%!important;scrollbar-width:none;-webkit-overflow-scrolling:touch}
      .app-nav.cozy-common-nav::-webkit-scrollbar{display:none}
      .app-nav.cozy-common-nav .app-tab{flex:1 0 auto!important;min-width:68px!important;text-align:center!important;padding:8px 7px!important;font-size:12px!important;white-space:nowrap!important}
      .app-nav.cozy-common-nav .app-tab.active{background:#fff!important;color:#111827!important;box-shadow:0 1px 4px rgba(0,0,0,.1)!important}
      button:disabled{opacity:.55!important;cursor:not-allowed!important}
      @media(max-width:520px){.app-nav.cozy-common-nav .app-tab{min-width:66px!important;padding:8px 6px!important;font-size:11.5px!important}}
    `;
    document.head.appendChild(s);
  }
  function apply(){
    const nav=document.querySelector('.app-nav');
    if(!nav) return false;
    addStyle();
    const cur=currentKey();
    nav.classList.add('cozy-common-nav');
    nav.setAttribute('aria-label','メインメニュー');
    nav.innerHTML=items.map(([key,label,href])=>`<a class="app-tab${key===cur?' active':''}" href="${href}"${key===cur?' aria-current="page"':''}>${label}</a>`).join('');
    return true;
  }

  if(!hasSupabaseAuthToken()) clearSensitiveCache();
  hardenLogout();
  hardenRecordSaving();
  markShortenedTextUnsaved();
  loadPageAddons();
  if(!apply()){
    const mo=new MutationObserver(()=>{if(apply())mo.disconnect()});
    mo.observe(document.documentElement,{childList:true,subtree:true});
    setTimeout(()=>mo.disconnect(),10000);
  }
  setTimeout(()=>{
    hardenLogout();
    hardenRecordSaving();
    markShortenedTextUnsaved();
    const overlay=document.getElementById('authOverlay');
    const login=document.getElementById('loginPanel');
    if(overlay&&!overlay.classList.contains('hidden')&&login&&!login.classList.contains('hidden')) clearSensitiveCache();
  },1500);
})();
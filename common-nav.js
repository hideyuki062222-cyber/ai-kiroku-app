(()=>{
  const BASE='/ai-kiroku-app/';
  const ATTENDANCE=BASE+'attendance/';
  const items=[
    ['today','今日',BASE+'dashboard/'],
    ['assignment','担当割当',BASE+'assignment/'],
    ['handoff','申し送り',BASE+'handoff/'],
    ['record','AI記録',BASE],
    ['attendance','出勤簿',ATTENDANCE],
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
  function wrapLogout(name){
    const original=window[name];
    if(typeof original!=='function'||original.__cacheSafetyWrapped) return;
    const wrapped=async function(...args){
      clearSensitiveCache();
      return original.apply(this,args);
    };
    wrapped.__cacheSafetyWrapped=true;
    window[name]=wrapped;
  }
  function currentKey(){
    const p=location.pathname;
    if(p.includes('/dashboard/')) return 'today';
    if(p.includes('/assignment/')) return 'assignment';
    if(p.includes('/handoff/')) return 'handoff';
    if(p.includes('/cashbook/')) return 'cashbook';
    if(p.includes('/attendance/')) return 'attendance';
    if(p.includes('/staff/')) return 'staff';
    return 'record';
  }
  function assignmentFlowRequested(){
    if(currentKey()!=='record')return false;
    const q=new URLSearchParams(location.search);
    return q.get('from')==='assignment';
  }
  function lockAssignmentFlowButtons(){
    if(!assignmentFlowRequested()||window.__assignmentContextGuardReady===true)return;
    document.querySelectorAll('button').forEach(btn=>{
      const text=(btn.textContent||'').trim();
      if(text==='AIで記録作成'||text==='別の文章を作る'||btn.id==='recordCommitButton')btn.disabled=true;
    });
  }
  function loadScript(id,src){
    if(document.getElementById(id)) return;
    const s=document.createElement('script');
    s.id=id;s.src=src;document.head.appendChild(s);
  }
  function loadPageAddons(){
    const key=currentKey();
    loadScript('clientRoomUiScript',BASE+'client-room-ui.js?v=20261014-1');
    if(key==='record'){
      lockAssignmentFlowButtons();
      loadScript('staffCompactScript',BASE+'staff-compact.js?v=20261014-2');
      loadScript('recordSafetyScript',BASE+'record-safety.js?v=20261020-1');
      if(assignmentFlowRequested()) loadScript('assignmentContextGuardScript',BASE+'assignment-context-guard.js?v=20261014-1');
    }else if(key==='cashbook'){
      loadScript('cashbookSafetyScript',BASE+'cashbook/safety-addon.js?v=20261014-3');
    }
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
  wrapLogout('cloudLogout');
  wrapLogout('logout');
  lockAssignmentFlowButtons();
  loadPageAddons();
  if(!apply()){
    const mo=new MutationObserver(()=>{if(apply())mo.disconnect()});
    mo.observe(document.documentElement,{childList:true,subtree:true});
    setTimeout(()=>mo.disconnect(),10000);
  }
  setTimeout(()=>{
    wrapLogout('cloudLogout');
    wrapLogout('logout');
    lockAssignmentFlowButtons();
    const overlay=document.getElementById('authOverlay');
    const login=document.getElementById('loginPanel');
    if(overlay&&!overlay.classList.contains('hidden')&&login&&!login.classList.contains('hidden')) clearSensitiveCache();
  },1500);
})();
(()=>{
  const BASE='/ai-kiroku-app/';
  const items=[
    ['today','今日',BASE+'dashboard/'],
    ['assignment','担当割当',BASE+'assignment/'],
    ['handoff','申し送り',BASE+'handoff/'],
    ['record','AI記録',BASE],
    ['cashbook','出納帳',BASE+'cashbook/']
  ];
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
  loadPageAddons();
  if(!apply()){
    const mo=new MutationObserver(()=>{if(apply())mo.disconnect()});
    mo.observe(document.documentElement,{childList:true,subtree:true});
    setTimeout(()=>mo.disconnect(),10000);
  }
})();

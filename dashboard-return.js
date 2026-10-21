(()=>{
 const params=new URLSearchParams(location.search),isDashboard=/\/dashboard\/(?:index\.html)?$/.test(location.pathname);
 const prefix='aiKirokuDashboardReturn:';
 const valid=s=>s&&['day','night'].includes(s.mode)&&['mine','all'].includes(s.scope)&&/^\d{4}-\d{2}-\d{2}$/.test(s.date)&&typeof s.org==='string'&&Number.isFinite(s.scroll);
 const read=token=>{try{const s=JSON.parse(sessionStorage.getItem(prefix+token));return valid(s)?s:null}catch(e){return null}};
 if(isDashboard){
  const token=params.get('restore');
  let pending=(token&&read(token))||(valid(history.state?.dashboardView)?history.state.dashboardView:null);
  window.restoreDashboardView=()=>{
   if(!pending)return;
   document.getElementById('workPeriod').value=pending.mode;
   document.getElementById('workDate').value=pending.date;
   document.getElementById('assignmentScope').value=pending.scope;
   try{localStorage.setItem('activeOrganizationId',pending.org)}catch(e){}
  };
  document.addEventListener('dashboard-ready',()=>{
   if(!pending)return;
   const view=pending;pending=null;
   // Wait until the refreshed list has its final height before restoring the viewport.
   requestAnimationFrame(()=>requestAnimationFrame(()=>window.scrollTo({top:Math.max(0,view.scroll),behavior:'instant'})));
  });
  document.addEventListener('click',event=>{
   const a=event.target.closest?.('#todoList a, #assignList a');if(!a)return;
   const url=new URL(a.href,location.href);
   if(url.origin!==location.origin||!['record','assignment'].includes(url.searchParams.get('from')))return;
   const view={mode:document.getElementById('workPeriod').value,date:document.getElementById('workDate').value,scope:document.getElementById('assignmentScope').value,org:document.getElementById('orgSwitch').value,scroll:window.scrollY};
   if(!valid(view))return;
   const key=String(Date.now())+'-'+Math.random().toString(36).slice(2);
   try{
    sessionStorage.setItem(prefix+key,JSON.stringify(view));
    history.replaceState({...history.state,dashboardView:view},'');
    url.searchParams.set('returnDashboard',key);a.href=url.href;
   }catch(e){url.searchParams.set('returnDashboard','default');a.href=url.href;}
  });
  window.addEventListener('pageshow',event=>{
   if(event.persisted&&valid(history.state?.dashboardView)){
    pending=history.state.dashboardView;window.restoreDashboardView();
    if(typeof window.refresh==='function')window.refresh();
   }
  });
  return;
 }
 // Capture before the assignment safety code normalizes its URL.
 const returnToken=params.get('returnDashboard');if(!returnToken)return;
 const mount=()=>{
  if(document.getElementById('backToDashboard'))return;
  const a=document.createElement('a');a.id='backToDashboard';a.textContent='← 今日の担当に戻る';
  const url=new URL('./dashboard/',location.href);url.searchParams.set('restore',returnToken);a.href=url.href;
  a.style.cssText='position:fixed;right:16px;bottom:max(16px,env(safe-area-inset-bottom));z-index:1000;display:block;padding:14px 18px;border-radius:12px;background:#111827;color:#fff;font-size:15px;font-weight:800;text-decoration:none;box-shadow:0 3px 12px #0003;min-height:44px;box-sizing:border-box';
  document.body.append(a);document.body.style.paddingBottom='88px';
 };
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();

(()=>{
  const BASE='/ai-kiroku-app/';
  const SUPABASE_URL='https://pagamoaxhqszojxrpxyu.supabase.co';
  const SUPABASE_KEY='sb_publishable_GQFRQYCo2oACYAh9lj9ZyA_JqfIPJGT';
  function waitForSupabase(){return new Promise(resolve=>{if(window.supabase)return resolve(window.supabase);let n=0;const t=setInterval(()=>{if(window.supabase||++n>30){clearInterval(t);resolve(window.supabase||null)}},100)})}
  function isAdminSection(){const p=location.pathname;return p.includes('/admin/')||p.includes('/manage/')||p.includes('/staff/')}
  function addAdminLink(){const nav=document.querySelector('.app-nav');if(!nav||nav.querySelector('[data-admin-home]'))return;const a=document.createElement('a');a.href=BASE+'admin/';a.textContent='管理';a.dataset.adminHome='1';a.className='app-tab'+(isAdminSection()?' active':'');if(isAdminSection())a.setAttribute('aria-current','page');nav.appendChild(a)}
  async function run(){try{const lib=await waitForSupabase();if(!lib)return;const db=lib.createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});const {data:{session}}=await db.auth.getSession();if(!session)return;const saved=localStorage.getItem('activeOrganizationId');let q=db.from('organization_members').select('organization_id,role').eq('user_id',session.user.id);if(saved)q=q.eq('organization_id',saved);const {data,error}=await q;if(error)return;const isAdmin=(data||[]).some(x=>x.role==='admin');if(isAdmin)addAdminLink()}catch(e){console.warn('admin-link',e)}}
  run();
})();
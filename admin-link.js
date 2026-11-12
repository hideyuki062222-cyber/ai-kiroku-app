(()=>{
  const BASE='/ai-kiroku-app/';
  const SUPABASE_URL='https://pagamoaxhqszojxrpxyu.supabase.co';
  const SUPABASE_KEY='sb_publishable_GQFRQYCo2oACYAh9lj9ZyA_JqfIPJGT';
  let db,version=0;
  function remove(){document.querySelectorAll('[data-admin-home]').forEach(a=>a.remove())}
  function waitForSupabase(){return new Promise(resolve=>{if(window.supabase)return resolve(window.supabase);let n=0;const t=setInterval(()=>{if(window.supabase||++n>30){clearInterval(t);resolve(window.supabase||null)}},100)})}
  function isAdminSection(){const p=location.pathname;return p.includes('/admin/')||p.includes('/manage/')||p.includes('/staff/')}
  function addAdminLink(){const nav=document.querySelector('.app-nav');if(!nav||nav.querySelector('[data-admin-home]'))return;const a=document.createElement('a');a.href=BASE+'admin/';a.textContent='管理';a.dataset.adminHome='1';a.className='app-tab'+(isAdminSection()?' active':'');if(isAdminSection())a.setAttribute('aria-current','page');nav.appendChild(a)}
  async function run(){
    const current=++version;remove();
    try{
      const lib=await waitForSupabase();if(!lib||current!==version)return;
      if(!db){
        db=lib.createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
        db.auth.onAuthStateChange(()=>{remove();setTimeout(run,0)});
      }
      const {data,error:authError}=await db.auth.getUser();if(authError||!data.user)return;
      const saved=localStorage.getItem('activeOrganizationId');if(!saved)return;
      const [member,org]=await Promise.all([
        db.from('organization_members').select('role').eq('user_id',data.user.id).eq('organization_id',saved).maybeSingle(),
        db.from('organizations').select('is_active').eq('id',saved).maybeSingle()
      ]);
      if(current===version&&saved===localStorage.getItem('activeOrganizationId')&&!member.error&&!org.error&&member.data?.role==='admin'&&org.data?.is_active)addAdminLink();
    }catch(e){if(current===version)remove();console.warn('admin-link',e)}
  }
  document.addEventListener('change',e=>{
    if(e.target.matches?.('#orgSwitch,#cloudOrg,#org')){remove();setTimeout(run,0)}
  });
  window.addEventListener('storage',e=>{if(e.key==='activeOrganizationId'||e.key?.endsWith('-auth-token'))run()});
  window.addEventListener('pageshow',run);
  window.addEventListener('focus',run);
  run();
})();

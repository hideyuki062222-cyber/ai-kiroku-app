(()=>{
  'use strict';
  const $=id=>document.getElementById(id),ACTIVE='activeOrganizationId';
  const CACHE=['aiKirokuUsers','aiKirokuProfiles',ACTIVE];
  let db,user=null,organizations=[],memberships=[],generation=0,signingIn=false;
  const savedOrg=()=>{try{return localStorage.getItem(ACTIVE)}catch(_e){return null}};
  function saveOrg(id){try{localStorage.setItem(ACTIVE,id)}catch(_e){throw Error('施設の選択を保存できません。ブラウザの保存設定を確認してください。')}}
  function clearCache(){try{CACHE.forEach(key=>localStorage.removeItem(key))}catch(_e){}}
  function notice(message,error=false){$('status').hidden=!message;$('status').textContent=message;$('status').classList.toggle('error',error)}
  function hideContent(){
    $('portal').hidden=true;$('admin').hidden=true;$('unavailable').hidden=true;
    $('organization').replaceChildren();$('identity').textContent='';$('role').textContent='';
    organizations=[];memberships=[];
  }
  function showLogin(message=''){
    ++generation;user=null;hideContent();clearCache();
    $('login').hidden=false;$('logout').hidden=true;$('retry').hidden=true;notice(message);
  }
  function renderOrganization(id){
    const org=organizations.find(o=>o.id===id),member=memberships.find(m=>m.organization_id===id);
    if(!org||!member||!['admin','staff'].includes(member.role))throw Error('この施設を利用する権限がありません。');
    saveOrg(org.id);$('organization').value=org.id;
    $('role').textContent=member.role==='admin'?'管理者':'一般職員';
    $('identity').textContent=member.staff_name?member.staff_name+' さん':'業務を始めましょう。';
    $('admin').hidden=member.role!=='admin';$('portal').hidden=false;
    $('today').textContent=new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',year:'numeric',month:'long',day:'numeric',weekday:'long'}).format(new Date());
  }
  async function load(preferred){
    const version=++generation;
    hideContent();$('login').hidden=true;$('retry').hidden=true;notice('施設・権限を確認しています…');
    try{
      const auth=await db.auth.getUser();if(version!==generation)return;
      if(auth.error||!auth.data?.user){
        if(auth.error&&auth.error.status!==400&&auth.error.status!==401&&auth.error.status!==403&&auth.error.name!=='AuthSessionMissingError')throw Error('認証確認に失敗しました。');
        showLogin();return;
      }
      user=auth.data.user;$('logout').hidden=false;
      const m=await db.from('organization_members').select('organization_id,role,staff_name').eq('user_id',user.id);
      if(version!==generation)return;if(m.error)throw m.error;
      // Never trust cached facility IDs or user-editable JWT metadata for permissions.
      const members=(m.data||[]).filter(x=>['admin','staff'].includes(x.role));
      let orgs=[];
      if(members.length){
        const o=await db.from('organizations').select('id,name,is_active').in('id',members.map(x=>x.organization_id)).eq('is_active',true);
        if(version!==generation)return;if(o.error)throw o.error;
        orgs=(o.data||[]).filter(o=>o.is_active&&members.some(m=>m.organization_id===o.id));
      }
      memberships=members;organizations=orgs;
      if(!orgs.length){clearCache();$('unavailable').hidden=false;notice('');return}
      $('organization').replaceChildren(...orgs.map(o=>new Option(o.name,o.id)));
      const id=preferred||savedOrg();renderOrganization(orgs.find(o=>o.id===id)?.id||orgs[0].id);notice('');
    }catch(_e){
      if(version!==generation)return;hideContent();
      notice('施設・権限を確認できませんでした。通信状況を確認して再試行してください。',true);$('retry').hidden=false;
    }
  }
  $('loginForm').addEventListener('submit',async event=>{
    event.preventDefault();if(signingIn||!db)return;signingIn=true;$('loginButton').disabled=true;notice('ログインしています…');
    try{
      const {error}=await db.auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value});
      if(error)throw error;$('password').value='';await load();
    }catch(_e){notice('ログインできませんでした。入力内容と通信状況を確認してください。',true)}
    finally{signingIn=false;$('loginButton').disabled=false}
  });
  $('organization').addEventListener('change',event=>load(event.target.value));
  $('retry').addEventListener('click',()=>load());
  $('logout').addEventListener('click',async()=>{
    ++generation;hideContent();$('logout').disabled=true;notice('ログアウトしています…');
    try{const {error}=await db.auth.signOut();if(error)throw error;showLogin('ログアウトしました。')}
    catch(_e){notice('ログアウトできませんでした。通信状況を確認して再試行してください。',true);$('retry').hidden=false}
    finally{$('logout').disabled=false}
  });
  // Revalidate after other features/tabs, BFCache restores and membership changes.
  window.addEventListener('pageshow',event=>{if(event.persisted&&db)load()});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&db&&!signingIn)load()});
  window.addEventListener('storage',event=>{if(db&&(event.key===ACTIVE||event.key?.endsWith('-auth-token')))load()});
  if(!window.supabase?.createClient){hideContent();notice('ログイン機能を読み込めませんでした。通信状況を確認してページを再読み込みしてください。',true);return}
  db=window.supabase.createClient('https://pagamoaxhqszojxrpxyu.supabase.co','sb_publishable_GQFRQYCo2oACYAh9lj9ZyA_JqfIPJGT',{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  db.auth.onAuthStateChange((event,session)=>{
    // Keep auth callbacks synchronous; queries must run outside the auth lock.
    if(event==='SIGNED_OUT'){showLogin('ログインし直してください。');return}
    if((event==='SIGNED_IN'||event==='USER_UPDATED')&&!signingIn){hideContent();setTimeout(()=>load(),0)}
    if(user&&session&&session.user.id!==user.id){hideContent();setTimeout(()=>load(),0)}
  });
  load();
})();

(()=>{
  'use strict';
  const $=id=>document.getElementById(id),ACTIVE='activeOrganizationId';
  const CACHE=['aiKirokuUsers','aiKirokuProfiles',ACTIVE];
  let db,user=null,organizations=[],memberships=[],generation=0,signingIn=false,savingName=false,nameContext=null;
  const drafts=new Map();
  const savedOrg=()=>{try{return localStorage.getItem(ACTIVE)}catch(_e){return null}};
  function saveOrg(id){try{localStorage.setItem(ACTIVE,id)}catch(_e){throw Error('施設の選択を保存できません。ブラウザの保存設定を確認してください。')}}
  function clearCache(){try{CACHE.forEach(key=>localStorage.removeItem(key))}catch(_e){}}
  function notice(message,error=false){$('status').hidden=!message;$('status').textContent=message;$('status').classList.toggle('error',error)}
  function hideContent(){
    $('portal').hidden=true;$('admin').hidden=true;$('unavailable').hidden=true;
    $('nameRegistration').hidden=true;$('businessMenu').hidden=true;nameContext=null;
    $('organization').replaceChildren();$('identity').textContent='';$('role').textContent='';
    organizations=[];memberships=[];
  }
  function showLogin(message=''){
    ++generation;user=null;hideContent();clearCache();drafts.clear();
    $('login').hidden=false;$('logout').hidden=true;$('retry').hidden=true;notice(message);
  }
  function renderOrganization(id){
    const org=organizations.find(o=>o.id===id),member=memberships.find(m=>m.organization_id===id);
    if(!org||!member||!['admin','staff'].includes(member.role))throw Error('この施設を利用する権限がありません。');
    saveOrg(org.id);$('organization').value=org.id;
    $('role').textContent=member.role==='admin'?'管理者':'一般職員';
    $('identity').textContent=member.staff_name?member.staff_name+' さん':'業務を始めましょう。';
    const needsName=window.NexiaStaffName.missing(member.staff_name);
    $('businessMenu').hidden=needsName;$('nameRegistration').hidden=!needsName;$('admin').hidden=needsName||member.role!=='admin';$('portal').hidden=false;
    if(needsName){
      nameContext={userId:user.id,orgId:org.id,prior:member.staff_name??'',version:generation};
      $('nameFacility').textContent=org.name+' で使用するご本人の名前を入力してください。';
      $('staffName').value=drafts.get(user.id+'|'+org.id)||'';$('nameStatus').textContent='';
    }else{
      drafts.delete(user.id+'|'+org.id);
      const next=window.NexiaStaffName.returnPath(new URLSearchParams(location.search).get('next'));
      if(next)location.replace(next);
    }
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
  $('staffName').addEventListener('input',()=>{if(nameContext)drafts.set(nameContext.userId+'|'+nameContext.orgId,$('staffName').value)});
  $('nameForm').addEventListener('submit',async event=>{
    event.preventDefault();if(savingName||!nameContext)return;
    const context={...nameContext},name=window.NexiaStaffName.normalize($('staffName').value);
    if(window.NexiaStaffName.missing(name)||name.length>80){$('nameStatus').textContent='職員名を1〜80文字で入力してください。「氏名未設定」などの表記は使えません。';return}
    savingName=true;$('saveStaffName').disabled=true;$('organization').disabled=true;$('nameStatus').textContent='名前を登録しています…';
    try{
      const auth=await db.auth.getUser();if(context.version!==generation)return;
      if(auth.error||auth.data?.user?.id!==context.userId)throw Error('Session changed');
      const saved=await db.from('organization_members').update({staff_name:name}).eq('organization_id',context.orgId).eq('user_id',context.userId).eq('staff_name',context.prior).select('organization_id,user_id,staff_name');
      if(context.version!==generation)return;
      if(saved.error||saved.data?.length!==1||saved.data[0].organization_id!==context.orgId||saved.data[0].user_id!==context.userId||saved.data[0].staff_name!==name)throw Error('Name was not saved');
      drafts.delete(context.userId+'|'+context.orgId);await load(context.orgId);
    }catch(_e){if(context.version===generation)$('nameStatus').textContent='名前を登録できませんでした。入力は残っています。通信状況を確認して再試行してください。別の画面で登録済みの場合は再読み込みしてください。'}
    finally{savingName=false;$('saveStaffName').disabled=false;$('organization').disabled=false}
  });
  $('retry').addEventListener('click',()=>load());
  $('logout').addEventListener('click',async()=>{
    ++generation;hideContent();$('logout').disabled=true;notice('ログアウトしています…');
    try{const {error}=await db.auth.signOut();if(error)throw error;showLogin('ログアウトしました。')}
    catch(_e){notice('ログアウトできませんでした。通信状況を確認して再試行してください。',true);$('retry').hidden=false}
    finally{$('logout').disabled=false}
  });
  // Revalidate after other features/tabs, BFCache restores and membership changes.
  window.addEventListener('pageshow',event=>{if(event.persisted&&db)load()});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&db&&!signingIn&&!savingName)load()});
  window.addEventListener('storage',event=>{if(db&&(event.key===ACTIVE||event.key?.endsWith('-auth-token')))load()});
  if(!window.supabase?.createClient||!window.NexiaStaffName){hideContent();notice('ログイン機能を読み込めませんでした。通信状況を確認してページを再読み込みしてください。',true);return}
  db=window.supabase.createClient('https://pagamoaxhqszojxrpxyu.supabase.co','sb_publishable_GQFRQYCo2oACYAh9lj9ZyA_JqfIPJGT',{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  db.auth.onAuthStateChange((event,session)=>{
    // Keep auth callbacks synchronous; queries must run outside the auth lock.
    if(event==='SIGNED_OUT'){showLogin('ログインし直してください。');return}
    if((event==='SIGNED_IN'||event==='USER_UPDATED')&&!signingIn){hideContent();setTimeout(()=>load(),0)}
    if(user&&session&&session.user.id!==user.id){hideContent();setTimeout(()=>load(),0)}
  });
  load();
})();

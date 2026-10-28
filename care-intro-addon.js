(()=>{
  const DEFAULT_INTRO='指示内容確認しました。前回のサービス記録確認しました。';
  const FIELD_ID='profileCareIntro';
  let db=null;

  function q(id){return document.getElementById(id)}
  function introValue(v){const t=String(v||'').trim();return t||DEFAULT_INTRO}
  function getDb(){
    if(db)return db;
    const cfg=window.AI_KIROKU_CONFIG;
    if(!window.supabase||!cfg?.supabaseUrl||!cfg?.supabasePublishableKey)return null;
    db=window.supabase.createClient(cfg.supabaseUrl,cfg.supabasePublishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
    return db;
  }
  async function context(){
    const x=getDb();if(!x)return null;
    const {data:{session}}=await x.auth.getSession();
    const orgId=localStorage.getItem('activeOrganizationId');
    if(!session||!orgId)return null;
    const {data:m,error}=await x.from('organization_members').select('role').eq('organization_id',orgId).eq('user_id',session.user.id).maybeSingle();
    if(error)throw error;
    return {db:x,orgId,role:m?.role||'staff'};
  }
  function ensureField(){
    let field=q(FIELD_ID);if(field)return field;
    const support=q('profileSupportMethod');if(!support)return null;
    const label=document.createElement('label');
    label.htmlFor=FIELD_ID;label.style.marginTop='12px';label.textContent='②の冒頭文（利用者別）';
    field=document.createElement('textarea');
    field.id=FIELD_ID;field.maxLength=500;field.placeholder=DEFAULT_INTRO;field.value=DEFAULT_INTRO;field.disabled=true;
    const note=document.createElement('div');
    note.className='notice';
    note.textContent='未変更の場合は「'+DEFAULT_INTRO+'」を使います。括弧（ ）は付きません。';
    support.after(label);label.after(field);field.after(note);
    return field;
  }
  async function applyRole(){
    const field=ensureField();if(!field)return;
    try{const c=await context();field.disabled=!c||c.role!=='admin'}catch(_e){field.disabled=true}
  }
  function setFieldFromProfile(){
    const field=ensureField();if(!field)return;
    const code=q('profileUser')?.value||'';
    let p={};
    try{if(typeof profiles!=='undefined'&&code)p=profiles[code]||{}}catch(_e){}
    field.value=code?introValue(p.careIntro):DEFAULT_INTRO;
  }
  async function refreshCareIntros(){
    const c=await context();if(!c)return;
    const {data,error}=await c.db.from('clients').select('code,care_intro_text').eq('organization_id',c.orgId).eq('is_active',true);
    if(error)throw error;
    try{
      if(typeof profiles!=='undefined')for(const r of data||[])profiles[r.code]={...(profiles[r.code]||{}),careIntro:introValue(r.care_intro_text)};
    }catch(_e){}
    setFieldFromProfile();
    const field=ensureField();if(field)field.disabled=c.role!=='admin';
  }
  function patchLoadProfile(){
    const original=window.loadProfile;if(typeof original!=='function'||original.__careIntroWrapped)return;
    const wrapped=function(...args){const r=original.apply(this,args);setFieldFromProfile();refreshCareIntros().catch(e=>console.warn('care intro refresh',e));return r};
    wrapped.__careIntroWrapped=true;window.loadProfile=wrapped;
  }
  function patchClearProfile(){
    const original=window.clearProfile;if(typeof original!=='function'||original.__careIntroWrapped)return;
    const wrapped=function(...args){const r=original.apply(this,args);const f=ensureField();if(f)f.value=DEFAULT_INTRO;return r};
    wrapped.__careIntroWrapped=true;window.clearProfile=wrapped;
  }
  function patchSaveProfile(){
    const original=window.saveProfile;if(typeof original!=='function'||original.__careIntroWrapped)return;
    const wrapped=async function(...args){
      const code=q('profileUser')?.value||'';
      if(!code)return original.apply(this,args);
      const c=await context();if(!c)return original.apply(this,args);
      if(c.role!=='admin'){alert('プロフィールの変更は管理者のみ行えます。');return}
      const p={
        usual:q('profileUsual')?.value.trim()||'',
        trait:q('profileTrait')?.value.trim()||'',
        caution:q('profileCaution')?.value.trim()||'',
        communication:q('profileCommunication')?.value.trim()||'',
        supportMethod:q('profileSupportMethod')?.value.trim()||'',
        careIntro:introValue(q(FIELD_ID)?.value)
      };
      const status=q('profileStatus');if(status)status.textContent='保存中…';
      const {error}=await c.db.from('clients').update({usual:p.usual,trait:p.trait,caution:p.caution,communication:p.communication,support_method:p.supportMethod,care_intro_text:p.careIntro}).eq('organization_id',c.orgId).eq('code',code);
      if(error){console.error(error);if(status)status.textContent='プロフィールを保存できませんでした。';alert('プロフィールを保存できませんでした。');return}
      try{if(typeof profiles!=='undefined')profiles[code]={...p}}catch(_e){}
      if(status)status.textContent='「'+code+'」のプロフィールと②の冒頭文を保存しました。';
    };
    wrapped.__careIntroWrapped=true;window.saveProfile=wrapped;
  }
  function patchBuildCareRecord(){
    const original=window.buildCareRecord;if(typeof original!=='function'||original.__careIntroWrapped)return;
    const wrapped=function(...args){
      const result=original.apply(this,args);const profile=args[2]||{};const intro=introValue(profile.careIntro);
      if(intro===DEFAULT_INTRO||typeof result!=='string')return result;
      return result.startsWith(DEFAULT_INTRO)?intro+result.slice(DEFAULT_INTRO.length):result;
    };
    wrapped.__careIntroWrapped=true;window.buildCareRecord=wrapped;
  }
  function patchGenerate(){
    const original=window.generate;if(typeof original!=='function'||original.__careIntroWrapped)return;
    const wrapped=async function(...args){try{await refreshCareIntros()}catch(e){console.warn('care intro refresh before generate',e)}return original.apply(this,args)};
    wrapped.__careIntroWrapped=true;window.generate=wrapped;
  }
  async function boot(){
    ensureField();patchLoadProfile();patchClearProfile();patchSaveProfile();patchBuildCareRecord();patchGenerate();
    await applyRole();
    try{await refreshCareIntros()}catch(e){console.warn('care intro init',e)}
  }
  let tries=0;const t=setInterval(()=>{
    tries++;
    if(q('profileSupportMethod')&&typeof window.buildCareRecord==='function'&&typeof window.saveProfile==='function'){
      clearInterval(t);boot().catch(e=>console.warn('care intro boot',e));
    }else if(tries>80)clearInterval(t);
  },100);
})();
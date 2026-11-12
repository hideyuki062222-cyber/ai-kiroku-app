(()=>{
  'use strict';
  const BASE='/ai-kiroku-app/';
  const normalize=value=>String(value??'').replace(/[\u200B-\u200D\u2060\uFEFF]/g,'').trim();
  const missing=value=>!normalize(value)||['氏名未設定','職員名未登録','名前未登録','未登録','未設定'].includes(normalize(value));
  function returnPath(value){
    if(!value)return '';
    try{
      const url=new URL(value,new URL(BASE,location.href));
      if(url.origin!==location.origin||url.username||url.password||!url.pathname.startsWith(BASE))return '';
      const relative=url.pathname.slice(BASE.length);
      if(!/^(?:(?:dashboard|assignment|handoff|attendance|meals|cashbook|admin|staff|manage)\/(?:index\.html)?|index\.html)?$/.test(relative))return '';
      if((relative===''||relative==='index.html')&&!url.search)return '';
      if(['code','access_token','refresh_token','token_hash'].some(k=>url.searchParams.has(k)))return '';
      return url.pathname+url.search;
    }catch(_e){return ''}
  }
  window.NexiaStaffName=Object.freeze({normalize,missing,returnPath});
  if(/\/home\/(?:index\.html)?$/.test(location.pathname))return;
  let db,version=0,gate,observedOrg='',timer;
  const selected=()=>{const value=document.querySelector('#orgSwitch,#cloudOrg,#org')?.value;if(value)return value;try{return localStorage.getItem('activeOrganizationId')||''}catch(_e){return ''}};
  function show(message='職員名を確認しています…',error=false){
    window.__nexiaStaffNameReady=false;
    if(!gate){
      const style=document.createElement('style');style.textContent='.nexia-name-check{position:fixed;inset:0;margin:0;width:100%;height:100%;max-width:none;max-height:none;border:0;padding:24px 16px;background:#f4f7f6;color:#18363c;z-index:2147483647;box-sizing:border-box}.nexia-name-box{max-width:480px;margin:10vh auto;background:white;border:1px solid #dce5e5;border-radius:14px;padding:24px;font:16px/1.7 system-ui,sans-serif}.nexia-name-box button,.nexia-name-box a{display:inline-block;min-height:44px;margin:8px 8px 0 0;padding:10px;border:1px solid #bccdce;border-radius:8px;background:white;color:#18363c;box-sizing:border-box}.nexia-name-box [hidden]{display:none!important}@media print{.nexia-name-check{display:none!important}}';document.head.appendChild(style);
      gate=document.createElement('dialog');gate.className='nexia-name-check';gate.id='nexiaStaffNameCheck';gate.setAttribute('aria-label','職員名の確認');
      gate.innerHTML='<div class="nexia-name-box"><h2>NEXIA</h2><p role="status"></p><button type="button" hidden>もう一度確認する</button><a href="'+BASE+'home/">NEXIAトップへ</a></div>';
      gate.addEventListener('cancel',e=>e.preventDefault());gate.querySelector('button').onclick=check;document.body.appendChild(gate);
      if(typeof gate.showModal==='function')gate.showModal();else gate.setAttribute('open','');
    }
    gate.querySelector('[role="status"]').textContent=message;gate.querySelector('button').hidden=!error;
  }
  function release(){if(gate){gate.close?.();gate.remove();gate=null}window.__nexiaStaffNameReady=true}
  function schedule(){++version;clearTimeout(timer);show();timer=setTimeout(check,0)}
  async function check(){
    const current=++version;show();
    try{
      if(!window.supabase?.createClient)throw Error('SDK unavailable');
      if(!db){
        db=supabase.createClient('https://pagamoaxhqszojxrpxyu.supabase.co','sb_publishable_GQFRQYCo2oACYAh9lj9ZyA_JqfIPJGT',{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
        db.auth.onAuthStateChange((event,session)=>{
          if(event==='SIGNED_OUT'){++version;location.replace(BASE+'home/');return}
          if(event==='SIGNED_IN'||event==='USER_UPDATED')schedule();
        });
      }
      const auth=await db.auth.getUser();if(current!==version)return;
      if(auth.error||!auth.data?.user){
        if(auth.error&&!['AuthSessionMissingError'].includes(auth.error.name)&&![400,401,403].includes(auth.error.status))throw auth.error;
        release();return;
      }
      const m=await db.from('organization_members').select('organization_id,staff_name').eq('user_id',auth.data.user.id).order('created_at');
      if(current!==version)return;if(m.error)throw m.error;
      if(!m.data?.length){release();return} // Keep the existing facility-join flow available.
      const o=await db.from('organizations').select('id,is_active').in('id',m.data.map(x=>x.organization_id)).eq('is_active',true);
      if(current!==version)return;if(o.error)throw o.error;
      const members=m.data.filter(x=>(o.data||[]).some(y=>y.id===x.organization_id&&y.is_active));
      const hint=selected(),member=members.find(x=>x.organization_id===hint)||members[0];observedOrg=hint;
      if(member&&missing(member.staff_name)){
        const url=new URL(BASE+'home/',location.href),next=returnPath(location.pathname+location.search);
        if(next)url.searchParams.set('next',next);
        location.replace(url.href);return;
      }
      release();
    }catch(_e){if(current===version)show('職員名を確認できませんでした。通信状況を確認して再試行してください。',true)}
  }
  document.addEventListener('change',event=>{if(event.target.matches?.('#orgSwitch,#cloudOrg,#org'))schedule()});
  window.addEventListener('storage',event=>{if(event.key==='activeOrganizationId'||event.key?.endsWith('-auth-token'))schedule()});
  window.addEventListener('pageshow',event=>{if(event.persisted)schedule()});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule()});
  const observer=new MutationObserver(()=>{try{const id=selected();if(id!==observedOrg){observedOrg=id;schedule()}}catch(_e){}});
  observedOrg=selected();observer.observe(document.documentElement,{childList:true,subtree:true});
  check();
})();

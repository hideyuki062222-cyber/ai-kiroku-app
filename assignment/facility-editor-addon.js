// Only the additional service-setting surface; ordinary assignment editing is unchanged.
(()=>{
 const can=()=>NexiaPermissions.can(membership,'assignment_settings',organization);
 async function prime(){
  if(typeof organization==='undefined'||!organization||typeof membership==='undefined'||!membership||!session?.user){setTimeout(prime,100);return;}
  const orgId=organization.id,userId=session.user.id;await NexiaPermissions.load(sb,membership,organization,userId);
  if(organization.id===orgId&&session?.user.id===userId)renderClientSettings();
 }
 prime();
 const originalLoad=loadAll,originalRender=renderClientSettings,originalSave=saveTimes;
 loadAll=async function(...args){await NexiaPermissions.load(sb,membership,organization,session.user.id);return originalLoad.apply(this,args);};
 renderClientSettings=function(...args){if(!can()){document.getElementById('clientSettings').textContent='担当時間・サービス設定は管理者または施設編集者が変更できます。';return;}return originalRender.apply(this,args);};
 saveTimes=async function(cid){
  if(membership?.role==='admin')return originalSave(cid);
  try{
   await NexiaPermissions.requireEdit(sb,membership,organization,session.user.id,'assignment_settings');
   const ts=normalizeTimes(document.querySelector('[data-times="'+cid+'"]').value);if(!ts)throw Error('時間は 7:00 / 13:00 / 17:30 の形式で入力してください。');
   const expected=slots.filter(s=>s.client_id===cid&&s.is_active).map(s=>s.service_time).sort();
   const {error}=await sb.rpc('save_facility_service_times',{p_org:organization.id,p_client:cid,p_times:ts,p_expected_times:expected});if(error)throw error;
   await loadAll();alert('サービス時間を保存しました。既存の担当割当・AI記録は保持されています。');
  }catch(e){alert('保存できませんでした：'+e.message);}
 };
})();

/* Shared display checks. Database policies remain the authority for every write. */
(function(root){
 'use strict';
 const features=Object.freeze(['handoff_settings','resident_info','meal_settings','assignment_settings']);
 function can(member,feature,org){return features.includes(feature)&&!!member&&member.organization_id===org?.id&&(member.role==='admin'||org.is_active!==false&&member.role==='staff'&&member.facilityEditor===true);}
 function label(member){return member?.role==='admin'?'管理者':member?.permissionError?'一般職員（編集権限未確認）':member?.facilityEditor===true?'施設編集者':'一般職員';}
 async function load(db,member,org,userId){
  if(!member)return;member.facilityEditor=false;member.permissionError=false;
  if(member.role!=='admin'&&member.organization_id===org?.id&&org.is_active!==false){
   try{
    const {data,error}=await db.from('organization_facility_editors').select('organization_id,user_id,enabled').eq('organization_id',org.id).eq('user_id',userId);
    if(error)throw error;if(!Array.isArray(data)||data.length>1||data.some(r=>r.organization_id!==org.id||r.user_id!==userId))throw Error('追加権限の所属・本人IDを確認できません。');
    member.facilityEditor=data[0]?.enabled===true;
   }catch(_error){member.permissionError=true;}
  }
  root.dispatchEvent?.(new CustomEvent('nexia-permissions-changed'));
 }
 async function requireEdit(db,member,org,userId,feature){await load(db,member,org,userId);if(!can(member,feature,org))throw Error('この施設の編集権限がありません。管理者に確認してください。');}
 root.NexiaPermissions=Object.freeze({features,can,label,load,requireEdit});
})(typeof window==='object'?window:globalThis);

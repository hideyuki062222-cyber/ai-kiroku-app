/* Ordinary staff operations are independent of these additive grants. DB checks every write. */
(function(root){
 'use strict';
 const definitions=Object.freeze([
  ['resident_info','利用者情報・プロフィール','基本情報・部屋番号・プロフィール・支援方法','基本情報・部屋番号のみ'],
  ['record_management','AI記録の管理・修正','保存済み記録を履歴付きで訂正'],
  ['handoff_settings','申し送りの管理・設定','入力設定・全職員確認状況・施設内の保管管理','入力設定のみ'],
  ['assignment_settings','担当割当の編集','担当者・時間帯・サービス・メモ','時間帯・サービス設定'],
  ['meal_settings','食事管理の設定・料金変更','食事形態・白米量・基本／追加料金','食事形態・白米量のみ'],
  ['cashbook_management','金銭出納帳の管理','施設内記録の修正・マスター設定・監査履歴'],
  ['staff_info','施設内の職員情報編集','氏名・所属表示・雇用区分（ログイン・権限は変更不可）'],
  ['exports','Excel・PDF出力','追加の管理用出力（対象データの権限も必要）']
 ].map(([key,label,description,legacy])=>Object.freeze({key,label,description,legacy})));
 const features=Object.freeze(definitions.map(d=>d.key)),legacyFeatures=Object.freeze(['handoff_settings','resident_info','meal_settings','assignment_settings']);
 function valid(member,org){return !!member&&member.organization_id===org?.id&&org.is_active!==false;}
 function can(member,feature,org,full=false){return features.includes(feature)&&valid(member,org)&&(member.role==='admin'||!member.permissionError&&member.role==='staff'&&(member.featurePermissions?.[feature]==='full'||!full&&member.featurePermissions?.[feature]==='legacy'));}
 const canFull=(member,feature,org)=>can(member,feature,org,true);
 function label(member){return member?.role==='admin'?'管理者':member?.permissionError?'一般職員（編集権限未確認）':Object.keys(member?.featurePermissions||{}).length?'施設編集者':'一般職員';}
 function parse(rows,org,user){
  if(!Array.isArray(rows)||rows.length>8)throw Error('権限データを確認できません。');const out={};
  for(const r of rows){if(r.organization_id!==org||r.user_id!==user||!features.includes(r.feature)||!['legacy','full'].includes(r.scope)||r.scope==='legacy'&&!legacyFeatures.includes(r.feature)||Object.hasOwn(out,r.feature))throw Error('権限の所属・本人IDを確認できません。');out[r.feature]=r.scope;}return out;
 }
 let sequence=0;const versions=new WeakMap();
 async function load(db,member,org,userId){
  if(!member)return;const version=++sequence;versions.set(member,version);member.permissionError=true;member.featurePermissions={};member.facilityEditor=false;
  if(member.role==='admin'&&valid(member,org))member.permissionError=false;
  else if(valid(member,org)){
   try{const {data,error}=await db.from('organization_feature_permissions').select('organization_id,user_id,feature,scope').eq('organization_id',org.id).eq('user_id',userId);if(error)throw error;const permissions=parse(data,org.id,userId);if(versions.get(member)!==version)return;member.featurePermissions=permissions;member.facilityEditor=Object.keys(permissions).length>0;member.permissionError=false;}catch(_error){/* Never write/clear stored grants after a failed read. */}
  }
  if(versions.get(member)===version)root.dispatchEvent?.(new CustomEvent('nexia-permissions-changed'));
 }
 async function requireEdit(db,member,org,userId,feature,full=false){await load(db,member,org,userId);if(!can(member,feature,org,full))throw Error('この施設の編集権限がありません。管理者に確認してください。');}
 root.NexiaPermissions=Object.freeze({definitions,features,legacyFeatures,can,canFull,label,parse,load,requireEdit});
})(typeof window==='object'?window:globalThis);

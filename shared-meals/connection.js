'use strict';
(function(){
 const c=window.MEAL_CONFIG||{};
 window.mealConnectionError='';window.mealDB=null;
 document.querySelectorAll('[data-company]').forEach(e=>e.textContent=c.companyName||'食事管理');
 try{
  if(!c.supabaseUrl||!c.publishableKey)throw Error('接続設定が未完了です。設置担当者が専用の保存先を設定してください。');
  const url=new URL(c.supabaseUrl);
  if(url.protocol!=='https:'||!/^([a-z0-9-]+)\.supabase\.co$/.test(url.hostname)||url.pathname!=='/'||url.search||url.hash)throw Error('専用プロジェクトのURLを確認してください。');
  if(!/^sb_publishable_[A-Za-z0-9_-]+$/.test(c.publishableKey))throw Error('Publishable keyを設定してください。秘密キーは使用できません。');
  if(!window.supabase)throw Error('接続ライブラリを読み込めませんでした。通信環境を確認して再読み込みしてください。');
  window.mealDB=supabase.createClient(url.origin,c.publishableKey,{auth:{storageKey:'standalone-meal-auth-'+url.hostname.split('.')[0]}});
 }catch(e){window.mealConnectionError=e.message;}
})();

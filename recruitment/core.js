(function(root,factory){const api=factory();if(typeof module==='object')module.exports=api;root.BrookCore=api;})(typeof globalThis!=='undefined'?globalThis:this,()=>{
  'use strict';
  const fields={title:'募集職種',employment_type:'雇用形態',salary:'給与・手当',hours:'勤務時間・休憩',duties:'仕事内容',requirements:'応募資格',benefits:'待遇・福利厚生',holidays:'休日・休暇'};
  const statuses={new:'新規応募',contacted:'連絡済み',interview:'面接予定',offered:'内定',hired:'採用',rejected:'不採用',withdrawn:'辞退'};
  const locationNames={gamo:'COZY蒲生',toyonaka:'COZY豊中',sakai:'COZY堺'};
  const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  function effective(template,job){return Object.fromEntries(Object.keys(fields).map(k=>[k,job.overrides?.[k]??template.terms?.[k]??'']));}
  function ready(terms,location,settings){return Object.values(terms).every(v=>typeof v==='string'&&v.trim())&&!!location.address?.trim()&&!!location.access?.trim()&&!!settings.privacy_text?.trim()&&!!settings.contact_text?.trim()&&Number.isInteger(settings.retention_days)&&settings.retention_days>0;}
  function validateApplication(data){
    const errors=[];const value={};
    for(const [key,max] of Object.entries({full_name:160,email:254,phone:30,qualifications:500,message:2000})){if(typeof data[key]!=='string'){errors.push('入力内容を確認してください。');value[key]='';continue;}value[key]=data[key].trim();if(value[key].length>max)errors.push('入力文字数が上限を超えています。');}
    value.phone=value.phone.replace(/[０-９]/g,c=>String.fromCharCode(c.charCodeAt(0)-65248));
    if(!value.full_name)errors.push('氏名を入力してください。');
    if(!value.email&&!value.phone)errors.push('メールアドレスか電話番号のどちらかを入力してください。');
    if(value.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email))errors.push('メールアドレスを確認してください。');
    if(value.phone&&!/^\+?[0-9 ()-]{8,30}$/.test(value.phone))errors.push('電話番号を確認してください。');
    if(data.consent!==true)errors.push('個人情報の取り扱いへの同意が必要です。');
    if(!uuid.test(data.job_id||'')||!uuid.test(data.request_id||''))errors.push('求人を選び直してください。');
    if(typeof data.privacy_version!=='string'||!data.privacy_version)errors.push('個人情報の案内を再読み込みしてください。');
    return {errors,value:{...value,job_id:data.job_id,request_id:data.request_id,consent:true,privacy_version:data.privacy_version}};
  }
  function initial(){const template={id:'11111111-1111-4111-8111-111111111111',terms:Object.fromEntries(Object.keys(fields).map(k=>[k,''])),revision:1};return {templates:[template],locations:Object.entries(locationNames).map(([code,name],i)=>({id:`22222222-2222-4222-8222-22222222222${i}`,code,name,address:'',access:'',is_active:true,revision:1})),jobs:Object.keys(locationNames).map((code,i)=>({id:`33333333-3333-4333-8333-33333333333${i}`,location_id:`22222222-2222-4222-8222-22222222222${i}`,template_id:template.id,overrides:{},is_published:false,revision:1})),settings:{id:true,release_enabled:false,privacy_text:'',contact_text:'',retention_days:null,privacy_version:'draft-1',revision:1},applicants:[]};}
  function newId(){if(globalThis.crypto.randomUUID)return globalThis.crypto.randomUUID();const a=globalThis.crypto.getRandomValues(new Uint8Array(16));a[6]=(a[6]&15)|64;a[8]=(a[8]&63)|128;const h=Array.from(a,x=>x.toString(16).padStart(2,'0')).join('');return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20);}
  return {fields,statuses,locationNames,effective,ready,validateApplication,initial,newId};
});

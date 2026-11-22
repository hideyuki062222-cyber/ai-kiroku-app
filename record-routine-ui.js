/* Routine-care settings share the existing profile row, authority and revision. */
(()=>{
 'use strict';const C=NexiaFactCore,R=NexiaRoutineCore,F=NexiaFactUI,q=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let scope=null,scopeKey='',dailyIdentity='',day=new Map(),draft=null,dirty=false,saving=false;
 const panel=document.createElement('section');panel.id='routineDaily';q('factServiceChecks').after(panel);
 const settings=document.createElement('details');settings.id='routineSettings';settings.innerHTML='<summary>利用者・サービスごとの普段のケア設定</summary><p>今回実施した記録とは別の設定です。ケア手順と本人が行う部分を登録できます。例：腰に手を添えて起き上がりを介助する。体調・反応・支援後は当日に入力してください。</p><p id="routineSettingScope"></p><label>サービス<select id="routineSettingService">'+Object.keys(C.serviceActions).map(s=>'<option>'+esc(s)+'</option>').join('')+'</select></label><label>ケア項目を追加<select id="routineAddItem"><option value="">項目を選択すると下のメモへ追加します</option></select></label><label>普段のケア手順（1行に1つ）<textarea id="routineSettingNote" maxlength="5000" rows="4" placeholder="例：起き上がりを介助した"></textarea></label><label>既存プロフィールの支援方法を参照<select id="routineSettingRef"><option value="">参照しない</option>'+R.refs.map(k=>'<option value="'+k+'">'+R.refLabels[k]+'</option>').join('')+'</select></label><pre id="routineSettingReference"></pre><p>参照する値はここへ複製せず、既存の保存元を使います。日々の確認で読み取れない内容は参考表示だけにします。</p><div class="routine-actions"><button type="button" id="routineSave">普段のケア設定を保存</button><button type="button" id="routineReload">設定を再読込</button></div><p id="routineSettingStatus" role="status"></p>';
 q('structuredProfile').after(settings);
 const profile=()=>F.profileState(),selection=()=>[...document.querySelectorAll('input[name=serviceContent]:checked')].map(e=>e.value),notify=()=>panel.dispatchEvent(new Event('change',{bubbles:true}));
 function selectedEntry(service){return scope?.row?.routine_care?.[service];}
 function configured(e){return e&&((Array.isArray(e.items)&&e.items.length)||e.profile_ref);}
 function sourceFor(service){return R.resolve(C,service,selectedEntry(service),scope.data,scope.legacy);}
 function stamp(service,s){return {...(s.source||{}),state:s.state,confirmed:!!s.confirmed,confirmedAt:s.confirmedAt||'',confirmedDate:s.confirmedDate||'',actualNote:s.actualNote||''};}
 function confirmSource(service,s){const src=sourceFor(service);s.source={profileRevision:scope.row.revision,fingerprint:src.fingerprint,items:JSON.parse(JSON.stringify(src.items)),actorId:scope.actor};s.confirmed=true;s.confirmedAt=new Date().toISOString();s.confirmedDate=q('factDate').value;}
 function render(){
  if(!scope||scope.org!==localStorage.getItem('activeOrganizationId')||scope.code!==q('user').value){panel.replaceChildren();return;}
  panel.innerHTML=selection().filter(s=>configured(selectedEntry(s))).map(service=>{
   const src=sourceFor(service),s=day.get(service)||{state:'unconfirmed',confirmed:false,actualNote:''};day.set(service,s);
   return '<article class="routine-care" data-routine-service="'+esc(service)+'"><strong>'+esc(service)+'：普段のケア</strong><pre>'+esc(src.items.map(R.itemLabel).join('\n')||'記録へ反映できる具体的なケアがまだありません。')+'</pre>'+(src.ignored.length?'<details><summary>既存プロフィールの参考情報</summary><pre>'+esc(src.ignored.join('\n'))+'</pre><p>この参考情報は当日の実施内容として自動追加しません。</p></details>':'')+'<label>当日の実施状況<select data-routine-state><option value="unconfirmed" '+(s.state==='unconfirmed'?'selected':'')+'>未確認（参考のみ）</option><option value="usual" '+(s.state==='usual'?'selected':'')+'>普段どおり（表示ケアを実施確認）</option><option value="changed" '+(s.state==='changed'?'selected':'')+'>変更あり</option></select></label><p class="fact-hint">今回実施したケアだけ確認してください。体調・本人の反応・支援後は別に入力します。</p><div '+(s.state!=='changed'?'hidden':'')+'><label>今日行った内容へ書き換える<textarea data-routine-actual rows="3" maxlength="5000">'+esc(s.actualNote||'')+'</textarea></label><p>行わなかった手順は消してください。普段の手順はこの欄とは別に足しません。</p><button type="button" data-routine-confirm>この内容を今回実施したことを確認</button></div><p data-routine-status role="status">'+(s.confirmed?'今回の実施を確認済み':s.state==='changed'?'内容を編集した後、今回の実施を確認してください。':'普段のケアを今回実施したとは記録しません。')+'</p></article>';
  }).join('');
 }
 function loadDraft(force=false){
  const e=profile().editor;if(!e)return;
  if(dirty&&!force&&draft?.org===e.org&&draft?.client===e.client.id)return;
  const service=q('routineSettingService').value,entry=e.row?.routine_care?.[service];draft={org:e.org,client:e.client.id,code:e.code,actor:e.actor,revision:e.row?.revision||0,service,row:e.row,legacy:e.legacy,data:e.row?.data||{}};
  q('routineSettingScope').textContent=e.client.display_name+' ／ '+(e.canProfile?'利用者情報・プロフィールの編集権限あり':'閲覧のみ（編集にはプロフィールの全範囲の権限が必要）');
  q('routineSettingNote').value=(entry?.items||[]).map(R.itemLabel).join('\n');q('routineSettingRef').value=entry?.profile_ref||'';
  q('routineAddItem').innerHTML='<option value="">項目を選択すると下のメモへ追加します</option>'+[['action','職員のケア',C.serviceActions[service]],['self','本人が行う部分',C.selfChoices[service]||['自分で選択した']],['method','伝え方・ペース',C.methodChoices]].map(([kind,label,values])=>'<optgroup label="'+label+'">'+values.map((value,i)=>'<option value="'+kind+':'+i+'">'+esc(R.itemLabel({kind,value}))+'</option>').join('')+'</optgroup>').join('');
  settings.querySelectorAll('input,textarea,select,button').forEach(el=>el.disabled=!e.canProfile||saving);q('routineSettingService').disabled=false;q('routineReload').disabled=false;
  showReference();dirty=false;
 }
 function showReference(){if(!draft)return;q('routineSettingReference').textContent=R.referenceText({profile_ref:q('routineSettingRef').value},draft.data,draft.legacy)||'参照する既存情報はありません。';}
 function reset(){day=new Map();render();}
 function onProfile(){
  if(!profile().editor){settings.querySelectorAll('textarea,select,button').forEach(el=>el.disabled=true);q('routineReload').disabled=false;q('routineSettingScope').textContent='プロフィールを読み込むまで編集できません。未保存の入力は保持しています。';}
  const d=profile().dailyProfile;
  if(d&&d.org===localStorage.getItem('activeOrganizationId')&&d.code===q('user').value){
   const nextKey=d.org+'|'+d.clientId+'|'+d.actor+'|'+(d.row?.revision||0);
   const nextIdentity=d.org+'|'+d.clientId+'|'+d.actor,identityChanged=dailyIdentity!==nextIdentity;dailyIdentity=nextIdentity;
   if(identityChanged)day=new Map();else if(scopeKey!==nextKey)for(const s of day.values()){s.confirmed=false;s.confirmedAt='';s.source=null;if(s.state==='usual')s.state='unconfirmed';}
   scope=d;scopeKey=nextKey;
  }else{scope=null;scopeKey='';}
  render();loadDraft();
 }
 function collect(f){
  if(!scope||scope.code!==q('user').value||scope.org!==localStorage.getItem('activeOrganizationId'))return f;
  const services={};for(const a of f.actions){if(!configured(selectedEntry(a.service)))continue;const s=day.get(a.service)||{state:'unconfirmed'};services[a.service]=s.state==='unconfirmed'?{state:'unconfirmed',confirmed:false}:stamp(a.service,s);}
  return Object.keys(services).length?{...f,routineCare:{version:1,organizationId:scope.org,clientId:scope.clientId,actorId:scope.actor,services}}:f;
 }
 async function verify(f,c,client){
  if(!f.routineCare)return;
  const r=f.routineCare;if(r.organizationId!==c.org||r.clientId!==client||r.actorId!==c.actor)throw Error('普段のケアを確認した職員・施設・利用者が変わっています。もう一度確認してください。');
  if(!Object.values(r.services).some(x=>x.state!=='unconfirmed'))return;
  const [ps,cs]=await Promise.all([c.db.from('client_record_profiles').select('*').eq('organization_id',c.org).eq('client_id',client).maybeSingle(),c.db.from('clients').select('id,usual,trait,caution,communication,support_method').eq('organization_id',c.org).eq('id',client).eq('is_active',true).maybeSingle()]);
  if(ps.error||cs.error||!ps.data||!cs.data)throw Error('普段のケアの最新状態を確認できません。入力を保持しています。再読み込みして確認してください。');
  for(const [service,s]of Object.entries(r.services)){if(s.state==='unconfirmed')continue;const resolved=R.resolve(C,service,ps.data.routine_care?.[service],ps.data.data,cs.data);if(ps.data.revision!==s.profileRevision||resolved.fingerprint!==s.fingerprint)throw Error('普段のケアや参照プロフィールが更新されています。入力を保持しているため、再読み込み後に内容を確認してください。');}
 }
 async function save(){
  if(!draft||saving||!profile().editor)return;const base={...draft},parsed=R.parseDraft(C,base.service,q('routineSettingNote').value),ref=q('routineSettingRef').value;
  if(parsed.errors.length){q('routineSettingStatus').textContent='ケア手順として読み取れない表現：'+parsed.errors.join('／')+'。上の「ケア項目を追加」から選べます。体調・反応・支援後は当日に入力してください。';return;}
  saving=true;q('routineSave').disabled=true;
  try{const c=await F.context();if(!c.canProfile||c.org!==base.org||c.actor!==base.actor||q('profileUser').value!==base.code)throw Error('編集する施設・利用者・権限を確認してください。');
   const result=await c.db.rpc('save_routine_care',{p_org:base.org,p_client:base.client,p_revision:base.revision,p_service:base.service,p_items:parsed.items,p_profile_ref:ref});if(result.error)throw Error(result.error.message);
   dirty=false;F.adoptRoutineRow(result.data,base.org,base.client);loadDraft(true);q('routineSettingStatus').textContent='普段のケアを保存しました。他のサービス・プロフィール・履歴は保持しています。';
  }catch(e){q('routineSettingStatus').textContent='保存できませんでした：'+e.message+'。入力は保持しています。';}finally{saving=false;settings.querySelectorAll('textarea,select,button').forEach(el=>el.disabled=!profile().editor?.canProfile);q('routineSettingService').disabled=false;q('routineReload').disabled=false;}
 }
 panel.addEventListener('change',e=>{
  if(!e.target.matches('[data-routine-state]'))return;const service=e.target.closest('[data-routine-service]').dataset.routineService,s=day.get(service),src=sourceFor(service);s.state=e.target.value;s.confirmed=false;
  if(s.state==='usual'&&src.items.length)confirmSource(service,s);
  if(s.state==='changed'&&!s.actualNote)s.actualNote=R.actualNote(src.items);
  render();
 });
 panel.addEventListener('input',e=>{if(!e.target.matches('[data-routine-actual]'))return;const host=e.target.closest('[data-routine-service]'),s=day.get(host.dataset.routineService);s.actualNote=e.target.value;s.confirmed=false;host.querySelector('[data-routine-status]').textContent='内容を編集したため、今回の実施を確認してください。';});
 panel.addEventListener('click',e=>{if(!e.target.matches('[data-routine-confirm]'))return;const host=e.target.closest('[data-routine-service]'),s=day.get(host.dataset.routineService);if(!s.actualNote.trim()){host.querySelector('[data-routine-status]').textContent='今日行ったことを入力してください。';return;}confirmSource(host.dataset.routineService,s);host.querySelector('[data-routine-status]').textContent='今回の実施を確認済み';notify();});
 document.querySelectorAll('input[name=serviceContent]').forEach(el=>el.addEventListener('change',()=>{if(!el.checked)day.delete(el.value);render();}));q('factDate').addEventListener('change',reset);
 settings.addEventListener('input',e=>{e.stopPropagation();dirty=true;});settings.addEventListener('change',e=>{
  e.stopPropagation();if(e.target.id==='routineSettingService'){if(dirty&&!confirm('普段のケアの未保存入力を破棄してサービスを切り替えますか？')){q('routineSettingService').value=draft.service;return;}dirty=false;loadDraft(true);return;}
  dirty=true;if(e.target.id==='routineSettingRef')showReference();
  if(e.target.id==='routineAddItem'&&e.target.value){const [kind,index]=e.target.value.split(':'),value=({action:C.serviceActions[draft.service],self:C.selfChoices[draft.service]||['自分で選択した'],method:C.methodChoices})[kind][Number(index)];const label=R.itemLabel({kind,value});const rows=q('routineSettingNote').value.split('\n');if(!rows.includes(label))q('routineSettingNote').value=[...rows.filter(Boolean),label].join('\n');e.target.value='';}
 });
 q('routineSave').onclick=save;q('routineReload').onclick=()=>{if(dirty&&!confirm('普段のケアの未保存入力を破棄して再読み込みしますか？'))return;dirty=false;window.loadProfile();};
 window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
 window.NexiaRoutineUI={collect,verify,reset,onProfile,canSwitch(code,org){if(dirty&&draft&&(draft.code!==code||draft.org!==org)){if(!confirm('普段のケアの未保存入力を破棄して切り替えますか？')){q('profileUser').value=draft.code;return false;}dirty=false;}return true;}};
 onProfile();
})();

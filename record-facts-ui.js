/* Loaded synchronously by the record wrapper before safety/assignment add-ons. */
(()=>{
 'use strict';
 const C=window.NexiaFactCore;if(!C)throw Error('事実入力の生成処理を読み込めませんでした。');
 const q=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const now=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 let db,editor=null,profileVersion=0,profileDirty=false,dailyDirty=false,previousUser=q('user').value;
 const legacyLabels={usual:'普段の様子',trait:'本人の特性',caution:'注意事項',communication:'伝え方',support_method:'基本的な支援方法'};
 const legacyFields={usual:'profileUsual',trait:'profileTrait',caution:'profileCaution',communication:'profileCommunication',support_method:'profileSupportMethod'};
 const getDb=()=>db||(db=supabase.createClient(AI_KIROKU_CONFIG.supabaseUrl,AI_KIROKU_CONFIG.supabasePublishableKey));
 const check=r=>{if(r.error)throw Error(r.error.message);return r.data;};
 async function context(){
  const x=getDb(),auth=await x.auth.getUser();if(auth.error||!auth.data.user)throw Error('ログイン状態を確認してください。');
  const org=q('orgSwitch')?.value||localStorage.getItem('activeOrganizationId');
  if(!org||org!==localStorage.getItem('activeOrganizationId'))throw Error('施設の選択を確認して再読み込みしてください。');
  const [m,o]=await Promise.all([x.from('organization_members').select('role').eq('organization_id',org).eq('user_id',auth.data.user.id).maybeSingle(),x.from('organizations').select('is_active').eq('id',org).maybeSingle()]);
  const member=check(m),facility=check(o);if(!member||!facility?.is_active)throw Error('この施設を利用できません。');
  return {db:x,org,actor:auth.data.user.id,role:member.role};
 }
 function candidateServices(){return [...document.querySelectorAll('input[name=serviceContent]:checked')].map(e=>e.value);}
 function actionRows(){
  const box=q('factActions'),old=new Map([...box.querySelectorAll('[data-fact-service]')].map(e=>[e.dataset.factService,{actions:[...e.querySelectorAll('input:checked')].map(i=>i.value),note:e.querySelector('[data-action-note]').value,self:e.querySelector('[data-self]').value}]));
  box.innerHTML=candidateServices().map(service=>`<details class="fact-service" data-fact-service="${esc(service)}" open><summary>${esc(service)} <span>当日実施した支援だけ選択</span></summary><div class="fact-choices">${(C.serviceActions[service]||[]).map(v=>`<label><input type="checkbox" value="${esc(v)}" ${old.get(service)?.actions.includes(v)?'checked':''}>${esc(v)}</label>`).join('')}</div><label>実施したことの補足（必要なとき）<input data-action-note maxlength="1000" value="${esc(old.get(service)?.note||'')}" placeholder="選択肢にない支援を入力"></label><label>本人が自分で行ったこと（任意・具体的な動作は補足へ）<select data-self><option value="">未入力</option>${['食具を操作した','衣類を着た','衣類を脱いだ','手を洗った','歯を磨いた','歩いて移動した','自分で選択した'].map(v=>`<option ${old.get(service)?.self===v?'selected':''}>${v}</option>`).join('')}</select></label></details>`).join('')||'<p>サービス内容を選ぶと、その支援で実際に行ったことを選択できます。補足だけでの記録も可能です。</p>';
 }
 function collect(){return {version:1,date:q('factDate').value,scene:q('visitScene').value,condition:q('condition').value,health:q('health').value,statement:q('factStatement').value,difference:q('factDifference').value,concern:q('factConcern').value,actions:[...q('factActions').querySelectorAll('[data-fact-service]')].map(e=>({service:e.dataset.factService,actions:[...e.querySelectorAll('input:checked')].map(i=>i.value),note:e.querySelector('[data-action-note]').value,self:e.querySelector('[data-self]').value})),supportNote:q('input').value,response:q('factResponse').value,after:q('factAfter').value};}
 function resetDaily(){
  for(const id of ['visitScene','condition','health','input','factStatement','factDifference','factConcern','factResponse','factAfter'])q(id).value='';
  q('factActions').replaceChildren();actionRows();dailyDirty=false;
  q('visitResult').textContent='ここに訪問時の記録文が表示されます。';q('careResult').textContent='ここに支援中の記録文が表示されます。';
  q('inputCount').textContent='0文字';q('recordCommitButton')?.setAttribute('disabled','');
 }
 function profileForm(data={}){
  q('structuredProfile').innerHTML=Object.entries(C.profileFields).map(([k,[label,choices]])=>`<details><summary>${label}</summary><div class="fact-choices">${choices.map(v=>`<label><input type="checkbox" data-profile="${k}" value="${esc(v)}" ${(data[k]?.choices||[]).includes(v)?'checked':''}>${esc(v)}</label>`).join('')}</div><label>${label}の補足（任意）<textarea data-profile-note="${k}" maxlength="1000">${esc(data[k]?.note||'')}</textarea></label></details>`).join('');
 }
 function setProfileRole(admin){
  q('structuredProfile').querySelectorAll('input,textarea').forEach(e=>e.disabled=!admin);
  Object.values(legacyFields).forEach(id=>q(id).disabled=!admin);
  q('factProfileSave').disabled=!admin;q('factProfileRole').textContent=admin?'管理者として編集できます。全項目任意です。':'閲覧のみです。機微なプロフィールの編集は管理者が行います。';
 }
 async function loadStructured(code){
  if(profileDirty&&editor?.code===code)return;
  if(profileDirty&&!confirm('プロフィールに未保存の入力があります。破棄して切り替えますか？')){q('profileUser').value=editor?.code||'';return;}
  const ticket=++profileVersion;editor=null;profileDirty=false;q('factProfileStatus').textContent='読み込み中…';profileForm();setProfileRole(false);
  if(code===q('user').value)q('factReference').textContent='参考情報を確認しています…';
  if(!code){q('factProfileStatus').textContent='利用者を選択してください。';q('factReference').textContent='プロフィールは当日の出来事として自動記載しません。';return;}
  try{
   const c=await context();const clients=check(await c.db.from('clients').select('id,code,display_name,room_number,usual,trait,caution,communication,support_method,care_intro_text').eq('organization_id',c.org).eq('code',code).eq('is_active',true));
   if(clients.length!==1)throw Error('利用者IDを確認できません。');const client=clients[0];
   const ps=check(await c.db.from('client_record_profiles').select('*').eq('organization_id',c.org).eq('client_id',client.id));
   if(ticket!==profileVersion||q('profileUser').value!==code||c.org!==localStorage.getItem('activeOrganizationId'))return;
   const row=ps[0]||null,legacy=Object.fromEntries(Object.keys(legacyFields).map(k=>[k,client[k]||'']));editor={...c,code,client,row,legacy};
   for(const [k,id]of Object.entries(legacyFields))q(id).value=legacy[k];profileForm(row?.data);setProfileRole(c.role==='admin');
   q('factProfileStatus').textContent=ps.length?'登録済みのプロフィールを読み込みました。':'新しい選択項目は未登録です。以前の登録内容は下に保持しています。';
   q('factOldIntro').textContent=client.care_intro_text||C.INTRO;
   if(code===q('user').value){const refs=Object.entries(row?.data||{}).filter(([,v])=>v.choices?.length||v.note).map(([k,v])=>`${C.profileFields[k]?.[0]||k}：${[...(v.choices||[]),v.note].filter(Boolean).join('、')}`);const old=Object.entries(legacy).filter(([,v])=>v).map(([k,v])=>`${legacyLabels[k]}：${v}`);q('factReference').textContent=[...refs,...old].join('\n')||'登録済みプロフィールはありません。当日の事実だけで記録を作成できます。';}
  }catch(e){if(ticket!==profileVersion)return;q('factProfileStatus').textContent='プロフィールを読み込めませんでした：'+e.message;if(code===q('user').value)q('factReference').textContent='参考情報を読み込めませんでした。当日の事実を確認して入力してください。';}
 }
 function mount(){
  window.__nexiaFactsMode=true;
  const input=q('input'),card=input.closest('.card');card.id='factInputCard';
  const date=document.createElement('label');date.className='fact-date';date.innerHTML=`記録日 <span class="fact-required">必須</span><input type="date" id="factDate" min="2000-01-01" max="2100-12-31" required value="${now()}">`;q('user').closest('.grid').before(date);
  const intervention=q('interventionLevel');intervention.closest('.field-group').hidden=true;intervention.value='';
  const extraSettings=document.createElement('details');extraSettings.innerHTML='<summary>記録の設定（サービス種別・長さ）</summary>';const grid=q('user').closest('.grid');grid.after(extraSettings);extraSettings.append(q('service').parentElement,q('length').parentElement);
  const length=q('length');length.parentElement.querySelector('.notice').textContent='入力した事実は、文字数設定にかかわらず省略・水増ししません。';
  const one=document.createElement('details');one.className='fact-observation';one.innerHTML='<summary>発言・普段との違い・気になった点（必要なとき）</summary><label>本人の発言・訴え<textarea id="factStatement" maxlength="1000" placeholder="確認した発言・訴えをそのまま入力"></textarea></label><label>普段との違い<select id="factDifference"><option value="">未入力</option><option>普段どおりだった</option><option>普段より動作がゆっくりだった</option><option>普段より会話が少なかった</option></select></label><label>特に気になったこと<textarea id="factConcern" maxlength="1000"></textarea></label>';
  input.previousElementSibling.before(one);
  const act=document.createElement('section');act.innerHTML='<h3>② 当日実施した支援 <span class="fact-required">支援の選択または補足が必須</span></h3><p>担当からのサービス選択は予定です。実施したものをここで確認してください。</p><div id="factActions"></div>';
  input.previousElementSibling.before(act);
  const candidates=document.createElement('details');candidates.id='factCandidates';candidates.innerHTML='<summary>サービス内容を選ぶ・変更する（担当からの候補）</summary>';const checks=document.querySelector('input[name=serviceContent]').closest('.field-group');checks.before(candidates);candidates.append(checks);
  input.placeholder='選択肢にない実施内容や、未実施の理由・対応など（任意）';input.maxLength=5000;
  const reactions=document.createElement('details');reactions.innerHTML='<summary>支援中の反応・支援後の状態（確認したとき）</summary><p>選択肢にない反応・支援後の状況は、実施内容の補足欄へ入力してください。</p><label>介助中の本人の反応<select id="factResponse"><option value="">未入力</option><option>うなずいて応じた</option><option>自分の希望を伝えた</option><option>介助を断る意思を示した</option><option>表情が和らいだ</option></select></label><label>支援後の状態<select id="factAfter"><option value="">未入力</option><option>椅子に座って過ごした</option><option>ベッドで休んだ</option><option>自分で次の行動を始めた</option></select></label>';q('inputCount').after(reactions);
  const errs=document.createElement('div');errs.id='factErrors';errs.setAttribute('role','alert');errs.tabIndex=-1;reactions.after(errs);
  const pref=q('profileDetails'),legacy=document.createElement('details');legacy.id='legacyProfileFields';legacy.innerHTML='<summary>以前からの登録内容（保持しています）</summary>';
  while(pref.children.length>1)legacy.append(pref.children[1]);pref.append(legacy);
  legacy.querySelectorAll('button').forEach(b=>b.hidden=true);
  const admin=document.createElement('section');admin.innerHTML='<p>プロフィールは背景情報です。当日の観察・介助として自動挿入しません。未入力でも記録を作成できます。</p><p id="factProfileRole"></p><div id="structuredProfile"></div><button id="factProfileSave" type="button">プロフィールを保存</button><p id="factProfileStatus" role="status"></p><details><summary>保存済みの旧冒頭文設定</summary><p id="factOldIntro"></p><p>登録済みの設定は保持します。新しい記録では必須冒頭文を使用します。</p></details>';
  pref.insertBefore(admin,legacy); // Keep the existing profileUser selector readily available.
  const selector=q('profileUser').closest('.grid');if(selector.children[1])legacy.prepend(selector.children[1]);admin.prepend(selector);
  const ref=document.createElement('details');ref.className='fact-background';ref.innerHTML='<summary>選択中の利用者の普段の情報（参考）</summary><pre id="factReference">プロフィールは当日の出来事として自動記載しません。</pre>';date.after(ref);
  profileForm();setProfileRole(false);actionRows();
  window.loadProfile=function(){return loadStructured(q('profileUser').value);};
  window.saveProfile=saveProfile;window.clearProfile=()=>{if(!editor)return;profileForm();for(const id of Object.values(legacyFields))q(id).value='';profileDirty=true;q('factProfileStatus').textContent='入力をクリアしました。保存するまで登録内容は変わりません。';};
  q('factProfileSave').onclick=saveProfile;
  pref.addEventListener('input',()=>{profileDirty=true;});
  q('user').addEventListener('change',e=>{if(dailyDirty&&!confirm('当日の入力を破棄して利用者を切り替えますか？')){q('user').value=previousUser;e.stopImmediatePropagation();return;}previousUser=q('user').value;resetDaily();},true);
  card.addEventListener('input',()=>{dailyDirty=true;});card.addEventListener('change',()=>{dailyDirty=true;});
  ['visitScene','condition','health'].forEach(id=>q(id).addEventListener('change',()=>{if(q(id).value==='その他'){one.open=true;q('factConcern').focus();}}));
  document.querySelectorAll('input[name=serviceContent]').forEach(e=>e.addEventListener('change',actionRows));
  window.addEventListener('nexia-assignment-loaded',()=>{resetDaily();q('factDate').value=window.assignmentContext.date;q('factDate').readOnly=true;previousUser=q('user').value;});
  window.addEventListener('nexia-record-saved',()=>{dailyDirty=false;});
  window.addEventListener('beforeunload',e=>{if(profileDirty||dailyDirty){e.preventDefault();e.returnValue='';}});
  const oldClear=window.clearAll;window.clearAll=()=>{oldClear();resetDaily();};
  window.shortenCareResult=()=>{q('careResult').textContent=q('careResult').textContent.replace(/\s+/g,' ').trim();q('careResultCount').textContent=q('careResult').textContent.length+'文字';};
  window.generate=generate;window.NexiaFactUI={collect,signature:()=>JSON.stringify({org:localStorage.getItem('activeOrganizationId'),facts:collect()})};
  for(const id of ['visitResult','careResult']){q(id).contentEditable='true';q(id).setAttribute('role','textbox');q(id).setAttribute('aria-label',id==='visitResult'?'①の記録文（編集できます）':'②の記録文（編集できます）');}
  q('careResult').addEventListener('input',()=>{q('careResultCount').textContent=q('careResult').textContent.length+'文字';});
  q('visitResult').addEventListener('input',()=>{q('visitResultCount').textContent=q('visitResult').textContent.length+'文字';});
  document.querySelector('button[onclick="shortenCareResult()"]')?.replaceChildren(document.createTextNode('文章の空白を整える'));
 }
 async function saveProfile(){
  const savedContext=editor;if(!savedContext){q('factProfileStatus').textContent='利用者を選択し、プロフィールの読込完了を待ってください。';return;}
  const controls=[...q('profileDetails').querySelectorAll('input,select,textarea,button')].map(e=>[e,e.disabled]);controls.forEach(([e])=>e.disabled=true);
  const data=Object.fromEntries(Object.keys(C.profileFields).map(k=>[k,{choices:[...document.querySelectorAll('[data-profile="'+k+'"]:checked')].map(e=>e.value),note:document.querySelector('[data-profile-note="'+k+'"]').value.trim()}]));
  const legacy=Object.fromEntries(Object.entries(legacyFields).map(([k,id])=>[k,q(id).value]));
  try{
   const c=await context();if(c.role!=='admin'||c.org!==savedContext.org||c.actor!==savedContext.actor)throw Error('管理者権限・施設を確認してください。');
   if(editor!==savedContext||q('profileUser').value!==savedContext.code)throw Error('選択が変わりました。利用者を確認して保存し直してください。');
   check(await c.db.rpc('save_record_profile',{p_org:c.org,p_client:savedContext.client.id,p_revision:savedContext.row?.revision||0,p_data:data,p_expected_legacy:savedContext.legacy,p_legacy:legacy}));
   if(editor!==savedContext)return;profileDirty=false;await loadStructured(savedContext.code);q('factProfileStatus').textContent='プロフィールを保存しました。以前の値と変更履歴も保持しています。';
  }catch(e){q('factProfileStatus').textContent='保存できませんでした：'+e.message;}finally{controls.forEach(([e,disabled])=>{if(e.isConnected)e.disabled=disabled;});setProfileRole(editor?.role==='admin');}
 }
 async function generate(){
  const f=collect(),result=C.compose(f);q('factErrors').textContent=result.errors.join('\n');if(result.errors.length){q('factErrors').focus();return;}
  const code=q('user').value,service=q('service').value;if(!code){q('factErrors').textContent='利用者を選択してください。';return;}
  const c=await context();const client=check(await c.db.from('clients').select('id').eq('organization_id',c.org).eq('code',code).eq('is_active',true));if(client.length!==1)throw Error('利用者IDを確認できません。');
  if(window.assignmentContext?.organizationId&&(window.assignmentContext.organizationId!==c.org||window.assignmentContext.clientId!==client[0].id))throw Error('担当と選択施設が一致しません。');
  if(code!==q('user').value||service!==q('service').value||JSON.stringify(f)!==JSON.stringify(collect()))throw Error('作成中に入力が変更されました。もう一度作成してください。');
  q('visitResult').textContent=result.visit;q('careResult').textContent=result.care;q('visitResultCount').textContent=result.visit.length+'文字';q('careResultCount').textContent=result.care.length+'文字';
  const actions=f.actions.filter(a=>a.actions.length||a.note),level='';q('interventionLevel').value=level;
  await window.cloudSaveRecord({userCode:code,serviceType:q('service').value,visitScene:f.scene,condition:f.condition,health:f.health,lengthMode:q('length').value,services:actions.map(a=>a.service),careInput:f.supportNote,interventionLevel:level,supportMethodSnapshot:'',visitNote:result.visit,careNote:result.care,dailyFacts:f,serviceDate:f.date,factContext:{organizationId:c.org,clientId:client[0].id,actorId:c.actor}});
  window.addHistory(code+' / '+q('service').value,'【訪問時】'+result.visit+' 【支援中】'+result.care);
 }
 mount();
})();

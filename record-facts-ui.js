/* Real pinned-HTML record screen: confirmed inputs, local composition, existing save path. */
(()=>{
 'use strict';
 const C=window.NexiaFactCore;if(!C)throw Error('事実入力の生成処理を読み込めませんでした。');
 const q=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const now=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const legacyLabels={usual:'普段の様子',trait:'本人の特性',caution:'注意事項',communication:'伝え方',support_method:'基本的な支援方法'};
 const legacyFields={usual:'profileUsual',trait:'profileTrait',caution:'profileCaution',communication:'profileCommunication',support_method:'profileSupportMethod'};
 const commonServices=['服薬介助・確認','食事介助','トイレ介助','入浴介助','移動介助','口腔ケア'];
 let db,editor=null,profileVersion=0,profileDirty=false,dailyDirty=false,dailyProfile=null,previousUser=q('user').value,previousOrg=localStorage.getItem('activeOrganizationId');
 let actionState=new Map();
 const getDb=()=>db||(db=supabase.createClient(AI_KIROKU_CONFIG.supabaseUrl,AI_KIROKU_CONFIG.supabasePublishableKey));
 const check=r=>{if(r.error)throw Error(r.error.message);return r.data;};
 async function context(){
  const x=getDb(),auth=await x.auth.getUser();if(auth.error||!auth.data.user)throw Error('ログイン状態を確認してください。');
  const org=q('orgSwitch')?.value||localStorage.getItem('activeOrganizationId');
  if(!org||org!==localStorage.getItem('activeOrganizationId'))throw Error('施設の選択を確認して再読み込みしてください。');
  const [m,o]=await Promise.all([x.from('organization_members').select('role').eq('organization_id',org).eq('user_id',auth.data.user.id).maybeSingle(),x.from('organizations').select('is_active').eq('id',org).maybeSingle()]);
  const member=check(m),facility=check(o);if(!member||!facility?.is_active)throw Error('この施設を利用できません。');
  member.organization_id=org;facility.id=org;await NexiaPermissions.load(x,member,facility,auth.data.user.id);return {db:x,org,actor:auth.data.user.id,role:member.role,canProfile:NexiaPermissions.canFull(member,'resident_info',facility)};
 }
 function candidateServices(){return [...document.querySelectorAll('input[name=serviceContent]:checked')].map(e=>e.value);}
 function readCard(e){return {service:e.dataset.factService,actions:[...e.querySelectorAll('[data-action]:checked')].map(i=>i.value),reactions:[...e.querySelectorAll('[data-reaction]:checked')].map(i=>i.value),methods:[...e.querySelectorAll('[data-method]:checked')].map(i=>i.value),unconfirmed:e.querySelector('[data-unconfirmed]').value==='true',note:e.querySelector('[data-action-note]').value,self:e.querySelector('[data-self]').value,after:e.querySelector('[data-after]').value,open:e.querySelector('[data-service-details]').open};}
 function stash(){for(const e of q('factActions').querySelectorAll('[data-fact-service]'))actionState.set(e.dataset.factService,readCard(e));}
 function profileCandidates(){return dailyProfile?.code===q('user').value&&dailyProfile.org===localStorage.getItem('activeOrganizationId')?C.suggestions(dailyProfile.data):[];}
 function methodOptions(a){const suggested=profileCandidates();return [...suggested,...C.methodChoices.filter(m=>!suggested.includes(m))].map(v=>`<label class="fact-chip"><input type="checkbox" data-method value="${esc(v)}" ${(a.methods||[]).includes(v)?'checked':''}>${esc(v)}${suggested.includes(v)?'<small>普段の情報からの候補</small>':''}</label>`).join('');}
 function actionRows({read=true}={}){
  if(read)stash();const services=candidateServices();
  const button=s=>`<button type="button" data-service-picker="${esc(s)}" aria-pressed="${services.includes(s)}">${esc(s)}</button>`;
  q('factServicePicker').innerHTML='<details id="factServiceSelect" '+(services.length?'':'open')+'><summary>サービスを追加・変更</summary><div class="fact-service-picker">'+commonServices.map(button).join('')+'</div><details id="otherServices"><summary>ほかのサービス</summary><div class="fact-service-picker">'+Object.keys(C.serviceActions).filter(s=>!commonServices.includes(s)).map(button).join('')+'</div></details></details>';
  q('factActions').innerHTML=services.map(service=>{
   const a=actionState.get(service)||{service,actions:[],reactions:[],methods:[],note:'',self:'',after:'',unconfirmed:false,open:service==='その他'};
   const active=C.performed(a),choices=C.quickChoices[service]||[];
   const exact=p=>p.actions.length===a.actions.length&&p.actions.every(v=>a.actions.includes(v))&&!!p.unconfirmed===!!a.unconfirmed;
   const own=(C.selfChoices[service]||['自分で選択した']).filter(v=>!(service==='食事介助'&&v==='食具を操作した'));
   const after=[...C.afterChoices,...(service==='服薬介助・確認'?C.medicationAfter:[])];
   return `<article class="fact-service" data-fact-service="${esc(service)}"><div class="fact-service-heading"><h3>${esc(service)}</h3><span class="fact-confirmed" data-performed>${active?'実施内容を選択済み':'候補・実施内容は未確認'}</span></div><p class="fact-hint">今日、実際に行ったものを選択</p><div class="fact-presets">${choices.map(p=>`<button type="button" data-preset="${esc(p.id)}" aria-pressed="${exact(p)}">${esc(p.label)}</button>`).join('')}</div><div class="fact-patient"><p>そのときの本人の反応 <small>確認したときだけ</small></p><div class="fact-reactions">${C.reactions[service].map(v=>`<label class="fact-chip"><input type="checkbox" data-reaction value="${esc(v)}" ${(a.reactions||[]).includes(v)?'checked':''}>${esc(v)}</label>`).join('')}</div></div><details data-service-details ${a.open?'open':''}><summary>支援の詳細・自立部分・支援後・補足</summary><p>組み合わせを細かく変更できます。普段の支援方法は、今日も実施した場合だけ選んでください。</p><div class="fact-choices">${C.serviceActions[service].map(v=>`<label><input type="checkbox" data-action value="${esc(v)}" ${a.actions.includes(v)?'checked':''}>${esc(v)}</label>`).join('')}</div><label>本人が自分で行ったこと<select data-self><option value="">未入力</option>${own.map(v=>`<option ${a.self===v?'selected':''}>${esc(v)}</option>`).join('')}</select></label><label>支援後に確認した状態<select data-after><option value="">未入力</option>${after.map(v=>`<option ${a.after===v?'selected':''}>${esc(v)}</option>`).join('')}</select></label><details class="fact-methods"><summary>今日の声かけ・支援方法${profileCandidates().length?'（普段の情報から候補あり）':''}</summary><p>プロフィールは参考です。選択するまで記録文に入れません。</p><div data-method-options class="fact-choices">${methodOptions(a)}</div></details><label>この支援の補足（任意）<textarea data-action-note maxlength="1000" placeholder="本人の発言や、選択肢にない実施内容など">${esc(a.note)}</textarea></label></details><input type="hidden" data-unconfirmed value="${!!a.unconfirmed}"></article>`;
  }).join('')||'<p class="fact-empty">実施したサービスを選ぶと、具体的な支援と本人の反応が表示されます。担当からの候補は、自動で実施済みにはしません。</p>';
 }
 function refreshMethods(){for(const e of q('factActions').querySelectorAll('[data-fact-service]')){const a=readCard(e);e.querySelector('[data-method-options]').innerHTML=methodOptions(a);const s=e.querySelector('.fact-methods summary');s.textContent='今日の声かけ・支援方法'+(profileCandidates().length?'（普段の情報から候補あり）':'');}}
 function markDaily(){dailyDirty=true;stash();syncButtons();}
 function syncButtons(){for(const e of q('factActions').querySelectorAll('[data-fact-service]')){const a=readCard(e);e.querySelector('[data-performed]').textContent=C.performed(a)?'実施内容を選択済み':'候補・実施内容は未確認';for(const b of e.querySelectorAll('[data-preset]')){const p=C.quickChoices[a.service].find(p=>p.id===b.dataset.preset);b.setAttribute('aria-pressed',String(p.actions.length===a.actions.length&&p.actions.every(v=>a.actions.includes(v))&&!!p.unconfirmed===!!a.unconfirmed));}}
  q('factVisitChoices').querySelectorAll('[data-visit]').forEach(b=>b.setAttribute('aria-pressed',String(q('condition').value===b.dataset.visit)));
 }
 function collect(){return {version:1,composerRevision:2,lengthMode:q('length').value,date:q('factDate').value,scene:q('visitScene').value,condition:q('condition').value,health:q('health').value,statement:q('factStatement').value,difference:q('factDifference').value,concern:q('factConcern').value,actions:[...q('factActions').querySelectorAll('[data-fact-service]')].map(e=>{const {open,...a}=readCard(e);return a;}),supportNote:q('input').value,response:q('factResponse').value,after:q('factAfter').value};}
 function resetDaily(){
  for(const id of ['visitScene','condition','health','input','factStatement','factDifference','factConcern','factResponse','factAfter'])q(id).value='';
  actionState=new Map();dailyProfile=null;q('factActions').replaceChildren();actionRows({read:false});syncButtons();dailyDirty=false;
  q('visitResult').textContent='ここに訪問時の記録文が表示されます。';q('careResult').textContent='ここに支援中の記録文が表示されます。';
  q('inputCount').textContent='0文字';q('recordCommitButton')?.setAttribute('disabled','');q('factErrors').textContent='';q('factCompositionStatus').textContent='';q('factReference').textContent='プロフィールは当日の出来事として自動記載しません。';
 }
 function profileForm(data={}){
  q('structuredProfile').innerHTML=Object.entries(C.profileFields).map(([k,[label,choices]])=>`<details><summary>${label}</summary><div class="fact-choices">${choices.map(v=>`<label><input type="checkbox" data-profile="${k}" value="${esc(v)}" ${(data[k]?.choices||[]).includes(v)?'checked':''}>${esc(v)}</label>`).join('')}</div><label>${label}の補足（任意）<textarea data-profile-note="${k}" maxlength="1000">${esc(data[k]?.note||'')}</textarea></label></details>`).join('');
 }
 function setProfileRole(admin){
  q('structuredProfile').querySelectorAll('input,textarea').forEach(e=>e.disabled=!admin);
  Object.values(legacyFields).forEach(id=>q(id).disabled=!admin);
  q('factProfileSave').classList.remove('hidden');q('factProfileSave').hidden=false;q('factProfileSave').disabled=!admin;q('factProfileRole').textContent=admin?'プロフィール編集権限があります。全項目任意です。':'閲覧のみです。編集には利用者情報・プロフィールの全範囲の権限が必要です。';
 }
 async function loadStructured(code){
  if(profileDirty&&editor?.code===code)return;
  if(profileDirty&&!confirm('プロフィールに未保存の入力があります。破棄して切り替えますか？')){q('profileUser').value=editor?.code||'';return;}
  const ticket=++profileVersion;if(code===q('user').value){dailyProfile=null;refreshMethods();}editor=null;profileDirty=false;q('factProfileStatus').textContent='読み込み中…';profileForm();setProfileRole(false);
  if(code===q('user').value)q('factReference').textContent='参考情報を確認しています…';
  if(!code){q('factProfileStatus').textContent='利用者を選択してください。';q('factReference').textContent='プロフィールは当日の出来事として自動記載しません。';return;}
  try{
   const c=await context();const clients=check(await c.db.from('clients').select('id,code,display_name,room_number,usual,trait,caution,communication,support_method,care_intro_text').eq('organization_id',c.org).eq('code',code).eq('is_active',true));
   if(clients.length!==1)throw Error('利用者IDを確認できません。');const client=clients[0];
   const ps=check(await c.db.from('client_record_profiles').select('*').eq('organization_id',c.org).eq('client_id',client.id));
   if(ticket!==profileVersion||q('profileUser').value!==code||c.org!==localStorage.getItem('activeOrganizationId'))return;
   const row=ps[0]||null,legacy=Object.fromEntries(Object.keys(legacyFields).map(k=>[k,client[k]||'']));editor={...c,code,client,row,legacy};
   for(const [k,id]of Object.entries(legacyFields))q(id).value=legacy[k];profileForm(row?.data);setProfileRole(c.canProfile);
   q('factProfileStatus').textContent=ps.length?'登録済みのプロフィールを読み込みました。':'新しい選択項目は未登録です。以前の登録内容は下に保持しています。';
   q('factOldIntro').textContent=client.care_intro_text||C.INTRO;
   if(code===q('user').value){dailyProfile={org:c.org,code,clientId:client.id,data:row?.data||{},legacy};refreshMethods();const refs=Object.entries(row?.data||{}).filter(([,v])=>v.choices?.length||v.note).map(([k,v])=>`${C.profileFields[k]?.[0]||k}：${[...(v.choices||[]),v.note].filter(Boolean).join('、')}`);const old=Object.entries(legacy).filter(([,v])=>v).map(([k,v])=>`${legacyLabels[k]}：${v}`);q('factReference').textContent=[...refs,...old].join('\n')||'登録済みプロフィールはありません。当日の事実だけで記録を作成できます。';}
  }catch(e){if(ticket!==profileVersion)return;q('factProfileStatus').textContent='プロフィールを読み込めませんでした：'+e.message;if(code===q('user').value)q('factReference').textContent='参考情報を読み込めませんでした。当日の事実を確認して入力してください。';}
 }
 function mount(){
  window.__nexiaFactsMode=true;
  const input=q('input'),card=input.closest('.card');card.id='factInputCard';
  const date=document.createElement('label');date.className='fact-date';date.innerHTML=`記録日 <input type="date" id="factDate" min="2000-01-01" max="2100-12-31" required value="${now()}">`;q('user').closest('.grid').before(date);
  const intervention=q('interventionLevel');intervention.closest('.field-group').hidden=true;intervention.value='';
  const settings=document.createElement('details');settings.className='fact-optional';settings.innerHTML='<summary>記録の設定（日付・サービス種別・長さ）</summary>';q('user').closest('.grid').after(settings);settings.append(date,q('service').parentElement,q('length').parentElement);const dateCaption=document.createElement('p');dateCaption.id='factDateCaption';dateCaption.className='fact-hint';dateCaption.textContent='記録日：'+now();q('user').closest('.grid').before(dateCaption);q('user').parentElement.querySelector('.notice').hidden=true;q('length').parentElement.querySelector('.notice').textContent='短めは1段落、普通は支援別、長めは項目別に整理します。確認した事実は省略・水増ししません。';
  const originalChecks=document.querySelector('input[name=serviceContent]').closest('.field-group');originalChecks.hidden=true;
  const workflow=document.createElement('div');workflow.id='factWorkflow';workflow.innerHTML='<section aria-labelledby="factServiceTitle"><h2 id="factServiceTitle">実施した支援</h2><p class="fact-hint">サービスを選び、実際に行った内容を確認してください。</p><div id="factServicePicker"></div><div id="factActions"></div></section><section aria-labelledby="factVisitTitle"><h2 id="factVisitTitle">訪問時の本人の様子 <span class="fact-required">1つ以上</span></h2><div id="factVisitChoices" class="fact-visit-choices"></div><details id="factObservationDetails" class="fact-optional"><summary>姿勢・体調・発言・普段との違い</summary><div id="factLegacyObservations" class="grid"></div><label>本人の発言・訴え<textarea id="factStatement" maxlength="1000" placeholder="確認した発言や訴えを入力"></textarea></label><label>普段との違い<select id="factDifference"><option value="">未入力</option><option>普段どおりだった</option><option>普段より動作がゆっくりだった</option><option>普段より会話が少なかった</option></select></label><label>特に気になったこと<textarea id="factConcern" maxlength="1000"></textarea></label></details></section>';
  originalChecks.before(workflow);
  q('factVisitChoices').innerHTML=['落ち着いて過ごされていた','笑顔が見られた','眠そうな様子が見られた','疲れた様子が見られた'].map(v=>`<button type="button" data-visit="${esc(v)}" aria-pressed="false">${esc(v.replace('過ごされていた','過ごしていた'))}</button>`).join('');
  const observationGrid=q('visitScene').closest('.grid');for(const id of ['visitScene','condition','health'])q('factLegacyObservations').append(q(id).parentElement);observationGrid.remove();
  const supplement=document.createElement('details');supplement.className='fact-optional';supplement.id='factSupplement';supplement.innerHTML='<summary>全体の補足・反応・支援後（必要なとき）</summary><p>選択肢にない支援や反応、未実施の理由などを入力できます。</p>';
  const inputLabel=input.previousElementSibling;inputLabel.before(supplement);supplement.append(inputLabel,input,q('inputCount'));
  input.placeholder='必要なときだけ、実際に確認した内容を補足';input.maxLength=5000;
  const reactions=document.createElement('div');reactions.innerHTML='<label>支援全体で確認した本人の反応<select id="factResponse"><option value="">未入力</option><option>うなずいて応じた</option><option>自分の希望を伝えた</option><option>介助を断る意思を示した</option><option>表情が和らいだ</option></select></label><label>支援全体の終了後に確認した状態<select id="factAfter"><option value="">未入力</option>'+C.afterChoices.map(v=>'<option>'+v+'</option>').join('')+'</select></label>';supplement.append(reactions);
  const errors=document.createElement('div');errors.id='factErrors';errors.setAttribute('role','alert');errors.tabIndex=-1;supplement.after(errors);
  const actions=card.querySelector('.actions');actions.id='factGenerateActions';actions.setAttribute('aria-label','記録文の生成');
  const composition=document.createElement('p');composition.id='factCompositionStatus';composition.setAttribute('role','status');errors.after(composition);
  const pref=q('profileDetails'),legacy=document.createElement('details');legacy.id='legacyProfileFields';legacy.innerHTML='<summary>以前からの登録内容（保持しています）</summary>';
  while(pref.children.length>1)legacy.append(pref.children[1]);pref.append(legacy);legacy.querySelectorAll('button').forEach(b=>b.hidden=true);
  const admin=document.createElement('section');admin.innerHTML='<p>プロフィールは入力候補の参考です。当日の観察・実施内容へ自動挿入しません。未登録でも利用できます。</p><p id="factProfileRole"></p><div id="structuredProfile"></div><button id="factProfileSave" type="button">プロフィールを保存</button><p id="factProfileStatus" role="status"></p><details><summary>保存済みの旧冒頭文設定</summary><p id="factOldIntro"></p><p>登録済みの設定は保持します。新しい記録では必須冒頭文を使用します。</p></details>';pref.insertBefore(admin,legacy);
  const selector=q('profileUser').closest('.grid');if(selector.children[1])legacy.prepend(selector.children[1]);admin.prepend(selector);
  const ref=document.createElement('details');ref.className='fact-background';ref.innerHTML='<summary>普段のプロフィール（入力するときの参考）</summary><pre id="factReference">プロフィールは当日の出来事として自動記載しません。</pre>';date.after(ref);
  profileForm();setProfileRole(false);actionRows();syncButtons();
  window.loadProfile=function(){return loadStructured(q('profileUser').value);};window.saveProfile=saveProfile;window.clearProfile=()=>{if(!editor)return;profileForm();for(const id of Object.values(legacyFields))q(id).value='';profileDirty=true;q('factProfileStatus').textContent='入力をクリアしました。保存するまで登録内容は変わりません。';};q('factProfileSave').onclick=saveProfile;
  q('factServicePicker').onclick=e=>{const button=e.target.closest('[data-service-picker]');if(!button)return;stash();const service=button.dataset.servicePicker,source=[...document.querySelectorAll('input[name=serviceContent]')].find(c=>c.value===service),old=actionState.get(service);if(source.checked&&old&&(C.performed(old)||old.reactions?.length||old.self||old.after)&&!confirm(service+'の当日の入力を破棄して、候補から外しますか？'))return;source.checked=!source.checked;if(!source.checked)actionState.delete(service);source.dispatchEvent(new Event('change',{bubbles:true}));};
  q('factActions').onclick=e=>{const b=e.target.closest('[data-preset]');if(!b)return;const card=b.closest('[data-fact-service]'),p=C.quickChoices[card.dataset.factService].find(p=>p.id===b.dataset.preset),clear=b.getAttribute('aria-pressed')==='true';card.querySelectorAll('[data-action]').forEach(c=>c.checked=!clear&&p.actions.includes(c.value));card.querySelector('[data-unconfirmed]').value=String(!clear&&!!p.unconfirmed);markDaily();card.dispatchEvent(new Event('change',{bubbles:true}));};
  q('factVisitChoices').onclick=e=>{const b=e.target.closest('[data-visit]');if(!b)return;q('condition').value=q('condition').value===b.dataset.visit?'':b.dataset.visit;q('condition').dispatchEvent(new Event('change',{bubbles:true}));};
  card.addEventListener('input',markDaily);card.addEventListener('change',e=>{if(e.target.matches('[data-action]')&&e.target.checked&&e.target.value==='服薬したことを確認した')e.target.closest('[data-fact-service]').querySelector('[data-unconfirmed]').value='false';markDaily();});
  pref.addEventListener('input',()=>profileDirty=true);
  q('user').addEventListener('change',e=>{if(dailyDirty&&!confirm('当日の入力を破棄して利用者を切り替えますか？')){q('user').value=previousUser;e.stopImmediatePropagation();return;}previousUser=q('user').value;if(!window.assignmentContext?.assignmentId)document.querySelectorAll('input[name=serviceContent]').forEach(c=>c.checked=false);resetDaily();},true);
  document.addEventListener('change',e=>{if(e.target.id!=='orgSwitch'||e.target.value===previousOrg)return;if((dailyDirty||profileDirty)&&!confirm('未保存の当日入力・プロフィール編集を破棄して施設を切り替えますか？')){e.target.value=previousOrg;e.stopImmediatePropagation();return;}previousOrg=e.target.value;profileDirty=false;editor=null;resetDaily();},true);
  document.querySelectorAll('input[name=serviceContent]').forEach(e=>e.addEventListener('change',()=>{actionRows();dailyDirty=true;}));
  q('factDate').addEventListener('change',()=>q('factDateCaption').textContent='記録日：'+q('factDate').value);
  ['visitScene','condition','health'].forEach(id=>q(id).addEventListener('change',()=>{if(q(id).value==='その他'){q('factObservationDetails').open=true;q('factConcern').focus();}}));
  window.addEventListener('nexia-assignment-loaded',()=>{resetDaily();q('factDate').value=window.assignmentContext.date;q('factDate').readOnly=true;q('factDateCaption').textContent='記録日：'+window.assignmentContext.date;previousUser=q('user').value;loadStructured(previousUser);});
  window.addEventListener('nexia-record-saved',()=>dailyDirty=false);window.addEventListener('beforeunload',e=>{if(profileDirty||dailyDirty){e.preventDefault();e.returnValue='';}});
  window.addEventListener('storage',e=>{if(e.key==='activeOrganizationId'&&e.newValue!==previousOrg){profileDirty=false;editor=null;previousOrg=e.newValue;resetDaily();}});
  const oldClear=window.clearAll;window.clearAll=()=>{oldClear();resetDaily();};
  window.shortenCareResult=()=>{q('careResult').textContent=q('careResult').textContent.replace(/\s+/g,' ').trim();q('careResultCount').textContent=q('careResult').textContent.length+'文字';};
  window.generate=generate;window.NexiaFactUI={collect,signature:()=>JSON.stringify({org:localStorage.getItem('activeOrganizationId'),facts:collect()})};
  for(const id of ['visitResult','careResult']){q(id).contentEditable='true';q(id).setAttribute('role','textbox');q(id).setAttribute('aria-label',id==='visitResult'?'①の記録文（編集できます）':'②の記録文（編集できます）');q(id).addEventListener('input',()=>q(id+'Count').textContent=q(id).textContent.length+'文字');}
  document.querySelectorAll('button[onclick="generate()"]').forEach(b=>{if(b.textContent.trim()==='別の文章を作る')b.textContent='入力内容で作り直す';});
  document.querySelector('button[onclick="shortenCareResult()"]')?.replaceChildren(document.createTextNode('文章の空白を整える'));
 }
 async function saveProfile(){
  const savedContext=editor;if(!savedContext){q('factProfileStatus').textContent='利用者を選択し、プロフィールの読込完了を待ってください。';return;}
  const controls=[...q('profileDetails').querySelectorAll('input,select,textarea,button')].map(e=>[e,e.disabled]);controls.forEach(([e])=>e.disabled=true);
  const data=Object.fromEntries(Object.keys(C.profileFields).map(k=>[k,{choices:[...document.querySelectorAll('[data-profile="'+k+'"]:checked')].map(e=>e.value),note:document.querySelector('[data-profile-note="'+k+'"]').value.trim()}]));
  const legacy=Object.fromEntries(Object.entries(legacyFields).map(([k,id])=>[k,q(id).value]));
  try{
   const c=await context();if(!c.canProfile||c.org!==savedContext.org||c.actor!==savedContext.actor)throw Error('プロフィール編集権限・施設を確認してください。');
   if(editor!==savedContext||q('profileUser').value!==savedContext.code)throw Error('選択が変わりました。利用者を確認して保存し直してください。');
   check(await c.db.rpc('save_record_profile',{p_org:c.org,p_client:savedContext.client.id,p_revision:savedContext.row?.revision||0,p_data:data,p_expected_legacy:savedContext.legacy,p_legacy:legacy}));
   if(editor!==savedContext)return;profileDirty=false;await loadStructured(savedContext.code);q('factProfileStatus').textContent='プロフィールを保存しました。以前の値と変更履歴も保持しています。';
  }catch(e){q('factProfileStatus').textContent='保存できませんでした：'+e.message;}finally{controls.forEach(([e,disabled])=>{if(e.isConnected)e.disabled=disabled;});setProfileRole(editor?.canProfile);}
 }
 async function generate(){
  const currentOrg=localStorage.getItem('activeOrganizationId'),currentUser=q('user').value;
  if(previousOrg&&currentOrg!==previousOrg||previousUser&&currentUser!==previousUser){previousOrg=currentOrg;previousUser=currentUser;resetDaily();q('factErrors').textContent='施設・利用者の選択が変わったため、当日の入力をクリアしました。選択内容を確認して入力し直してください。';return;}
  previousOrg=currentOrg;previousUser=currentUser;
  const f=collect(),result=C.compose(f);q('factErrors').textContent=result.errors.join('\n');if(result.errors.length){q('factErrors').focus();return;}
  const code=q('user').value,service=q('service').value;if(!code){q('factErrors').textContent='利用者を選択してください。';return;}
  const c=await context(),client=check(await c.db.from('clients').select('id').eq('organization_id',c.org).eq('code',code).eq('is_active',true));if(client.length!==1)throw Error('利用者IDを確認できません。');
  if(window.assignmentContext?.organizationId&&(window.assignmentContext.organizationId!==c.org||window.assignmentContext.clientId!==client[0].id))throw Error('担当と選択施設が一致しません。');
  if(code!==q('user').value||service!==q('service').value||JSON.stringify(f)!==JSON.stringify(collect()))throw Error('作成中に入力が変更されました。もう一度作成してください。');
  q('visitResult').textContent=result.visit;q('careResult').textContent=result.care;q('visitResultCount').textContent=result.visit.length+'文字';q('careResultCount').textContent=result.care.length+'文字';q('factCompositionStatus').textContent='確認した入力'+result.inputCount+'項目から作成しました。文章を確認・編集してから正式保存してください。';
  q('interventionLevel').value='';const actions=f.actions.filter(C.performed);
  await window.cloudSaveRecord({userCode:code,serviceType:service,visitScene:f.scene,condition:f.condition,health:f.health,lengthMode:f.lengthMode,services:actions.map(a=>a.service),careInput:f.supportNote,interventionLevel:'',supportMethodSnapshot:'',visitNote:result.visit,careNote:result.care,dailyFacts:f,serviceDate:f.date,factContext:{organizationId:c.org,clientId:client[0].id,actorId:c.actor}});
  window.addHistory(code+' / '+service,'【訪問時】'+result.visit+' 【支援中】'+result.care);
 }
 mount();
})();

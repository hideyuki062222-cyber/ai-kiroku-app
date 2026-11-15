// NEXIA handoff: existing templates/vitals retained from 91b47bf, workflow audited by RPCs.
const SUPABASE_URL="https://pagamoaxhqszojxrpxyu.supabase.co";
const SUPABASE_KEY="sb_publishable_GQFRQYCo2oACYAh9lj9ZyA_JqfIPJGT";
const db=supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
const CATS=["体調","食事","服薬","入浴","排泄","睡眠","受診","物品","家族連絡","予定","コール","その他"];
let quickInputs=[];
let session=null,membership=null,memberships=[],organization=null,organizations=[],clients=[],allClients=[],staffMap={},entries=[],confirmations=new Set();
let selectedDate=localDate(),shiftFilter="all",filterMode="all",entryShift="day",selectedCats=new Set(),selectedClientId=null;
let viewMode="day",historyClientId=null,historyDays=7,historyEntries=[],selectedQuickCategory="すべて";

const QUICK_CATEGORY_ORDER=["食事","入浴","排泄","服薬","体調","睡眠","受診","予定","コール","物品","家族連絡","その他"];
const QUICK_CATEGORY_LABELS={
 "食事":"🍚 食事","入浴":"🛁 入浴","排泄":"🚻 排泄","服薬":"💊 服薬","体調":"❤️ 体調","睡眠":"🌙 睡眠",
 "受診":"🏥 受診","予定":"📅 予定・外出","コール":"🔔 コール","物品":"📦 物品・生活","家族連絡":"☎ 家族連絡","その他":"その他"
};

function localDate(d=new Date()){return HandoffRules.date(d)}

function esc(v=""){return String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}

function fmtDate(v){const d=new Date(v+"T12:00:00");return d.toLocaleDateString("ja-JP",{month:"numeric",day:"numeric",weekday:"short"})}

function fmtTime(v){return new Date(v).toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit",timeZone:"Asia/Tokyo"})}

function clientLabel(c){return [c.room_number||c.code,c.display_name].filter(Boolean).join(" ")}

function entryStaff(e){return e.source_label||staffName(e.created_by)}

function show(id){document.getElementById(id).classList.remove("hidden")} function hide(id){document.getElementById(id).classList.add("hidden")}


async function loadQuickInputs(){
 const {data,error}=await db.from("handoff_quick_inputs")
   .select("id,label,category,sort_order")
   .eq("organization_id",membership.organization_id)
   .order("sort_order").order("created_at");
 if(error){console.error(error);quickInputs=[];return}
 quickInputs=data||[];
 renderCats();
 renderQuickManage();
}

function entryClientText(value){
 if(value==="__general__") return "📌 全体申し送り・備考";
 const c=clients.find(x=>x.id===value);
 return c ? clientLabel(c) : "利用者を選ぶ";
}

function updateEntryClientButton(){
 const sel=document.getElementById("entryClient"),txt=document.getElementById("entryClientButtonText");
 if(sel&&txt) txt.textContent=entryClientText(sel.value);
}

function openClientPicker(){
 const search=document.getElementById("clientSearch");
 if(search) search.value="";
 renderClientPicker();
 show("clientPickerOverlay");
 setTimeout(()=>{if(search)search.focus()},150);
}

function closeClientPicker(){hide("clientPickerOverlay")}

function renderClientPicker(){
 const q=(document.getElementById("clientSearch")?.value||"").trim().toLowerCase();
 const current=document.getElementById("entryClient")?.value||"";
 let items=[{id:"__general__",label:"📌 全体申し送り・備考",general:true},...clients.map(c=>({id:c.id,label:clientLabel(c),general:false}))];
 if(q) items=items.filter(x=>x.label.toLowerCase().includes(q));
 document.getElementById("clientPickerList").innerHTML=items.map(x=>'<button type="button" class="client-picker-item '+(x.general?"general ":"")+(x.id===current?"selected":"")+'" onclick="selectEntryClient(\''+x.id+'\')">'+esc(x.label)+'</button>').join("") || '<div class="empty">該当する利用者がいません</div>';
}

function selectEntryClient(value){
 document.getElementById("entryClient").value=value;
 updateEntryClientButton();
 closeClientPicker();
}

function renderCats(){
 const el=document.getElementById("templates"),tabs=document.getElementById("quickCategoryTabs");
 if(!el||!tabs)return;
 const cats=QUICK_CATEGORY_ORDER.filter(cat=>quickInputs.some(x=>(x.category||"その他")===cat));
 tabs.innerHTML=['すべて',...cats].map(cat=>'<button type="button" class="quick-cat-tab '+(selectedQuickCategory===cat?'active':'')+'" onclick="setQuickCategory(\''+cat+'\')">'+(cat==="すべて"?"すべて":QUICK_CATEGORY_LABELS[cat]||esc(cat))+'</button>').join("");
 if(!quickInputs.length){el.innerHTML='<span class="small">かんたん入力が登録されていません。</span>';return}
 if(selectedQuickCategory!=="すべて"&&!cats.includes(selectedQuickCategory))selectedQuickCategory="すべて";
 const showCats=selectedQuickCategory==="すべて"?cats:[selectedQuickCategory];
 let html="";
 for(const cat of showCats){
   const items=quickInputs.filter(x=>(x.category||"その他")===cat);
   if(!items.length)continue;
   if(selectedQuickCategory==="すべて") html+='<div class="quick-group-title">'+esc(QUICK_CATEGORY_LABELS[cat]||cat)+'</div>';
   html+='<div class="quick-buttons">'+items.map(x=>{
     const i=quickInputs.indexOf(x);
     return '<button class="cat" type="button" onclick="addTemplate('+i+')">'+esc(x.label)+'</button>';
   }).join("")+'</div>';
 }
 el.innerHTML=html||'<span class="small">このカテゴリーには項目がありません。</span>';
}

function setQuickCategory(cat){selectedQuickCategory=cat;renderCats()}

function appendBody(text){
 const el=document.getElementById("entryBody");
 const next=(el.value?(el.value+"\n"):"")+text;
 if(next.length>500){document.getElementById("entryStatus").textContent="申し送り内容は500文字までです。";return false}
 el.value=next;bodyCount();return true;
}

function addTemplate(i){
 const x=quickInputs[i]; if(!x)return;
 if(appendBody(x.label)) selectedCats.add(x.category||"その他");
}

function addWeight(){
 const v=document.getElementById("weightInput").value;
 if(v===""){document.getElementById("entryStatus").textContent="体重の数字を入力してください。";return}
 if(appendBody("体重 "+v+"kg")){selectedCats.add("体調");document.getElementById("weightInput").value="";document.getElementById("entryStatus").textContent=""}
}

function addVitals(){
 const t=document.getElementById("tempInput").value,spo2=document.getElementById("spo2Input").value,sys=document.getElementById("bpSysInput").value,dia=document.getElementById("bpDiaInput").value,p=document.getElementById("pulseInput").value;
 const parts=[];
 if(sys||dia) parts.push("血圧 "+(sys||"-")+"/"+(dia||"-"));
 if(p) parts.push("脈拍 "+p);
 if(spo2) parts.push("SpO₂ "+spo2+"%");
 if(t) parts.push("体温 "+t+"℃");
 if(!parts.length){document.getElementById("entryStatus").textContent="バイタルの数字を1つ以上入力してください。";return}
 if(appendBody("バイタル："+parts.join("、"))){
   selectedCats.add("体調");
   ["tempInput","spo2Input","bpSysInput","bpDiaInput","pulseInput"].forEach(id=>document.getElementById(id).value="");
   document.getElementById("entryStatus").textContent="";
 }
}

function bodyCount(){document.getElementById("bodyCounter").textContent=document.getElementById("entryBody").value.length+"/500"}

function setEntryShift(v){entryShift=v;document.getElementById("entryDay").classList.toggle("active",v==="day");document.getElementById("entryNight").classList.toggle("active",v==="night")}

function renderQuickManage(){
 const el=document.getElementById("quickManageList"); if(!el)return;
 if(!quickInputs.length){el.innerHTML='<span class="small">登録なし</span>';return}
 let html="";
 for(const cat of QUICK_CATEGORY_ORDER){
   const items=quickInputs.filter(x=>(x.category||"その他")===cat);
   if(!items.length)continue;
   html+='<div style="width:100%;font-size:12px;font-weight:900;color:#667489;margin-top:7px">'+esc(QUICK_CATEGORY_LABELS[cat]||cat)+'</div>';
   html+=items.map(x=>'<span class="quick-manage-item">'+esc(x.label)+'<button class="quick-delete" title="削除" onclick="deleteQuickInput(\''+x.id+'\')">×</button></span>').join("");
 }
 el.innerHTML=html;
}

async function addQuickInput(){
 const input=document.getElementById("newQuickInput"),label=input.value.trim(),category=document.getElementById("newQuickCategory").value||"その他",status=document.getElementById("quickManageStatus");
 if(!label){status.textContent="追加する言葉を入力してください。";return}
 status.textContent="追加中…";
 const maxOrder=quickInputs.reduce((m,x)=>Math.max(m,Number(x.sort_order)||0),0);
 const {error}=await db.from("handoff_quick_inputs").insert({
   organization_id:membership.organization_id,label,category,sort_order:maxOrder+10
 });
 if(error){status.textContent=error.code==="23505"?"同じかんたん入力がすでにあります。":"追加できませんでした: "+error.message;return}
 input.value="";status.textContent="追加しました。";await loadQuickInputs();
}

async function deleteQuickInput(id){
 const item=quickInputs.find(x=>x.id===id); const label=item?.label||"この項目";
 if(!confirm("「"+label+"」を削除しますか？"))return;
 const status=document.getElementById("quickManageStatus");status.textContent="削除中…";
 const {error}=await db.from("handoff_quick_inputs").delete().eq("id",id).eq("organization_id",membership.organization_id);
 if(error){status.textContent="削除できませんでした: "+error.message;return}
 status.textContent="削除しました。";await loadQuickInputs();
}




async function login(){const email=document.getElementById("email").value.trim(),password=document.getElementById("password").value;document.getElementById("authmsg").textContent="ログイン中…";const {data,error}=await db.auth.signInWithPassword({email,password});if(error){document.getElementById("authmsg").textContent=error.message;return}session=data.session;hide("auth");await loadMembership()}

async function signup(){const email=document.getElementById("email").value.trim(),password=document.getElementById("password").value;if(!email||password.length<12){document.getElementById("authmsg").textContent="メールアドレスと12文字以上のパスワードを入力してください。";return}const {data,error}=await db.auth.signUp({email,password});if(error){document.getElementById("authmsg").textContent=error.message;return}session=data.session;if(session){hide("auth");await loadMembership()}else document.getElementById("authmsg").textContent="登録しました。ログインしてください。"}

async function joinOrg(){const code=document.getElementById("joinCode").value.trim();const {data,error}=await db.rpc("join_organization",{p_join_code:code});document.getElementById("setupmsg").textContent=error?"参加できませんでした: "+error.message:"参加しました。";if(!error){localStorage.setItem("activeOrganizationId",data);await loadMembership()}}

async function logout(){clearHandoffData();await db.auth.signOut();location.replace('../home/');}


// New workflow uses server-authenticated identities and append-only activity.
const Rules=HandoffRules,$=id=>document.getElementById(id);
let staffMembers=[],receiptRows=[],activityRows=[],loadVersion=0,loaded=false;
let actionDraft=null,entryDraftId=null,entrySaving=false,lastEntryPayload=null,lastSavedEntry=null;
const pendingRequests=new Map(),busyEntries=new Set(),expandedEntries=new Set();
const actionLabels={confirmed:'確認',confirmation_cancelled:'確認取消',completed:'対応完了',reopened:'対応再開',carry:'継続表示を開始',archived:'保管',restored:'保管から戻す',legacy_completed:'既存の対応完了（旧データ）'};
const apiErrors={workflow_conflict:'別の職員が対応状態を変更しました。最新の状態を確認して、もう一度操作してください。',confirmation_conflict:'別画面で確認状態が変わりました。最新の状態を確認してください。',organization_membership_required:'この事業所を利用する権限を確認できません。',organization_inactive:'この事業所は利用停止中です。',entry_archived:'この申し送りは保管済みです。',author_or_admin_required:'保管・復元は投稿者か管理者だけが行えます。',not_authenticated:'ログイン状態を確認してください。',request_conflict:'保存結果を確認できません。最新の状態を確認してください。'};
function errorText(error){return apiErrors[error?.message]||('通信・保存に失敗しました：'+(error?.message||'再試行してください。'));}
function staffName(uid){return staffMap[uid]||('氏名を確認できない職員（'+String(uid||'').slice(0,8)+'）');}
function timestamp(value){return value?new Date(value).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}):'日時不明';}
function displayStaff(uid,snapshot){const name=snapshot||staffName(uid);return name+(staffMembers.filter(m=>m.staff_name===name).length>1?'［'+String(uid).slice(-8)+'］':'');}
function actorLabel(event){return event.actor_user_id?displayStaff(event.actor_user_id,event.actor_name):'対応者不明';}
function receiptFor(id,uid=session?.user.id){return receiptRows.find(c=>c.entry_id===id&&c.user_id===uid);}
function isUnread(e){return Rules.unread(e,session.user.id,receiptRows);}
function lookupEntry(id){return entries.find(e=>e.id===id);}
function requireData(result){if(result.error)throw result.error;return result.data||[];}
async function allRows(makeQuery){let out=[];for(let page=0;;page++){const rows=requireData(await makeQuery().range(page*500,page*500+499));out.push(...rows);if(rows.length<500)return out;}}
async function relatedRows(table,ids,org){const result=[];for(let i=0;i<ids.length;i+=80){const group=ids.slice(i,i+80);result.push(...await allRows(()=>{let q=db.from(table).select('*').in('entry_id',group);if(table==='handoff_activity')q=q.eq('organization_id',org).order('occurred_at').order('id');else q=q.order('entry_id').order('user_id');return q;}));}return result;}
async function init(){
 try{const {data,error}=await db.auth.getSession();if(error)throw error;session=data.session;if(!session){show('auth');return}hide('auth');await loadMembership();}
 catch(error){$('orgLabel').textContent='読み込めませんでした。再読み込みしてください。';$('summary').textContent=errorText(error);}
}
async function loadMembership(){
 const ms=requireData(await db.from('organization_members').select('organization_id,role,staff_name,created_at').eq('user_id',session.user.id).order('created_at'));
 memberships=ms;if(!ms.length){show('setup');return;}
 const os=requireData(await db.from('organizations').select('id,name,is_active,created_at').in('id',ms.map(m=>m.organization_id)).order('created_at'));
 organizations=os.filter(o=>o.is_active);if(!organizations.length){location.href='../manage/';return;}
 const saved=localStorage.getItem('activeOrganizationId');organization=organizations.find(o=>o.id===saved)||organizations[0];membership=ms.find(m=>m.organization_id===organization.id);
 localStorage.setItem('activeOrganizationId',organization.id);hide('setup');
 $('orgSwitch').innerHTML=organizations.map(o=>`<option value="${esc(o.id)}">${esc(o.name)}</option>`).join('');$('orgSwitch').value=organization.id;
 $('orgLabel').textContent=(membership.staff_name||'職員')+' / '+(membership.role==='admin'?'管理者':'一般職員');
 $('viewManageBtn').classList.toggle('hidden',membership.role!=='admin');$('adminTopBtn').classList.toggle('hidden',membership.role!=='admin');hide('adminCard');
 $('dateInput').value=selectedDate;$('reviewFrom').value=selectedDate;$('reviewTo').value=selectedDate;
 await Promise.all([loadClients(),loadStaff(),loadQuickInputs()]);await loadEntries();
}
function hasDraft(){return !$('entryOverlay').classList.contains('hidden')&&!!$('entryBody').value.trim()||!!actionDraft;}
function switchOrganization(id){if(!organizations.some(o=>o.id===id))return;if(hasDraft()&&!confirm('入力中の内容を破棄して事業所を切り替えますか？')){$('orgSwitch').value=organization.id;return}localStorage.setItem('activeOrganizationId',id);location.reload();}
async function loadClients(){
 allClients=requireData(await db.from('clients').select('id,code,room_number,display_name,sort_order,is_active').eq('organization_id',organization.id).order('sort_order').order('id'));
 clients=allClients.filter(c=>c.is_active);
 const options=list=>list.map(c=>`<option value="${esc(c.id)}">${esc(clientLabel(c))}${c.is_active?'':'（退去済み）'}</option>`).join('');
 $('entryClient').innerHTML='<option value="">利用者または全体を選択</option><option value="__general__">全体申し送り・備考</option>'+options(clients);
 $('historyClient').innerHTML=options(allClients);historyClientId=allClients[0]?.id||null;
 $('listClient').innerHTML='<option value="">全利用者</option>'+options(allClients);
 $('reviewClient').innerHTML='<option value="">全体・全利用者</option><option value="__general__">全体申し送り</option>'+options(allClients);updateEntryClientButton();
}
async function loadStaff(){
 staffMembers=requireData(await db.from('organization_members').select('user_id,staff_name,role').eq('organization_id',organization.id).order('user_id'));
 staffMap=Object.fromEntries(staffMembers.map(m=>[m.user_id,m.staff_name||'氏名未登録']));
 $('reviewStaff').innerHTML='<option value="">全職員</option>'+staffMembers.map(m=>`<option value="${esc(m.user_id)}">${esc(displayStaff(m.user_id))}</option>`).join('');
}
function rangeForView(){
 if(viewMode==='manage')return {from:$('reviewFrom').value,to:$('reviewTo').value};
 if(viewMode==='client'){const d=new Date(selectedDate+'T12:00:00+09:00');d.setUTCDate(d.getUTCDate()-(historyDays-1));return {from:localDate(d),to:selectedDate};}
 return {from:selectedDate,to:selectedDate};
}
async function loadEntries(){
 if(!membership)return;const version=++loadVersion,org=organization.id,{from,to}=rangeForView();
 loaded=false;for(const id of ['generalList','clientList','clientTimeline'])$(id).replaceChildren();for(const key of ['Unread','Important','Carry','Overdue'])$('count'+key).textContent='—';$('summary').textContent='最新の申し送りと確認履歴を読み込み中…';$('reloadEntries').disabled=true;
 if(!from||!to||from>to){$('summary').textContent='開始日と終了日を確認してください。';$('reloadEntries').disabled=false;return;}
 try{
  const base=()=>db.from('handoff_entries').select('*').eq('organization_id',org);
  const includeArchived=viewMode==='manage'&&$('includeArchived').checked;
  const [range,carry,due]=await Promise.all([
   allRows(()=>{let q=base().gte('service_date',from).lte('service_date',to).order('service_date').order('id');return includeArchived?q:q.eq('archived',false);}),
   allRows(()=>base().lt('service_date',from).eq('carry_over',true).eq('resolved',false).eq('archived',false).order('service_date').order('id')),
   allRows(()=>base().lt('service_date',from).not('due_date','is',null).eq('resolved',false).eq('archived',false).order('service_date').order('id'))
  ]);
  const records=[...new Map([...range,...carry,...due].map(e=>[e.id,e])).values()];
  const ids=records.map(e=>e.id),[receipts,activities]=await Promise.all([relatedRows('handoff_confirmations',ids,org),relatedRows('handoff_activity',ids,org)]);
  if(version!==loadVersion||organization.id!==org)return;
  const idSet=new Set(ids);if(records.some(e=>e.organization_id!==org)||receipts.some(c=>!idSet.has(c.entry_id))||activities.some(a=>a.organization_id!==org||!idSet.has(a.entry_id)))throw Error('取得した情報の事業所・申し送りIDを確認できません。');
  entries=records;receiptRows=receipts;activityRows=activities;historyEntries=records;confirmations=new Set(receipts.filter(c=>c.user_id===session.user.id&&Rules.active(c)).map(c=>c.entry_id));
  loaded=true;render();
 }catch(error){if(version!==loadVersion)return;entries=[];receiptRows=[];activityRows=[];for(const id of ['generalList','clientList','clientTimeline'])$(id).replaceChildren();$('summary').textContent='履歴を読み込めませんでした。'+errorText(error);}
 finally{if(version===loadVersion)$('reloadEntries').disabled=false;}
}
function visibleEntries(ignoreFilter=false){
 let list=entries.filter(e=>Rules.inShift(e,shiftFilter));
 if(viewMode==='client')list=list.filter(e=>e.client_id===historyClientId);
 if(viewMode==='day'&&$('listClient').value)list=list.filter(e=>e.scope==='general'||e.client_id===$('listClient').value);
 if(viewMode==='manage'){
  const uid=$('reviewStaff').value,cid=$('reviewClient').value;
  if(uid)list=list.filter(e=>e.created_by===uid||receiptRows.some(c=>c.entry_id===e.id&&c.user_id===uid)||activityRows.some(a=>a.entry_id===e.id&&a.actor_user_id===uid));
  if(cid)list=list.filter(e=>cid==='__general__'?e.scope==='general':e.client_id===cid);
 }
 if(!ignoreFilter){
  if(filterMode==='unread')list=list.filter(e=>viewMode==='manage'?Rules.awaiting(e,staffMembers,receiptRows).length>0:isUnread(e));
  if(filterMode==='important')list=list.filter(e=>e.is_important);
  if(filterMode==='carry')list=list.filter(Rules.carry);
  if(filterMode==='overdue')list=list.filter(e=>Rules.overdue(e));
 }
 return Rules.prioritize(list,session.user.id,receiptRows);
}
function dueBadge(e){return !e.due_date?'':`<span class="badge ${Rules.overdue(e)?'due-over':'amber'}">対応 ${esc(e.due_date)} ${esc(e.due_time?String(e.due_time).slice(0,5):'')}${Rules.overdue(e)?'・期限超過':''}</span>`;}
function receiptHtml(e){
 const active=receiptRows.filter(c=>c.entry_id===e.id&&Rules.active(c));
 let html=`<section class="receipt-section"><h4>確認状況</h4><div class="receipt-summary">確認済み ${active.length}名${active.length?'：'+active.map(c=>esc(displayStaff(c.user_id,c.staff_name))+'（'+esc(timestamp(c.confirmed_at))+'）').join('、'):''}</div></section>`;
 if(membership.role==='admin')html+=`<section class="review-matrix"><h4>全職員の確認状況</h4><p class="small">現在所属するログイン職員。確認・取消の操作は本人だけが行えます。</p><ul>${staffMembers.map(m=>{
  const c=receiptFor(e.id,m.user_id),confirmed=Rules.active(c);return `<li data-reader="${esc(m.user_id)}"><span>${esc(displayStaff(m.user_id))}</span><span>${confirmed?'確認済み '+esc(timestamp(c.confirmed_at)):m.user_id===e.created_by?'投稿者':'未確認'}</span></li>`;
 }).join('')}</ul></section>`;
 return html;
}
function activityList(list){
 return list.length?'<ol>'+list.map(a=>`<li data-activity="${esc(a.action)}"><strong>${esc(actionLabels[a.action]||a.action)}</strong> · ${esc(actorLabel(a))}<time>${esc(timestamp(a.occurred_at))}${a.legacy&&a.action==='confirmed'?'（既存の確認記録）':''}</time>${a.note?'<p>'+esc(a.note)+'</p>':''}</li>`).join('')+'</ol>':'<p class="small">記録はありません。</p>';
}
function eventHtml(e){
 const list=activityRows.filter(a=>a.entry_id===e.id).sort((a,b)=>Number(!!b.occurred_at)-Number(!!a.occurred_at)||String(b.occurred_at).localeCompare(String(a.occurred_at))||String(b.id).localeCompare(String(a.id)));
 const confirmations=list.filter(a=>['confirmed','confirmation_cancelled'].includes(a.action)),operations=list.filter(a=>!['confirmed','confirmation_cancelled'].includes(a.action));
 const completion=Rules.lastCompletion(e.id,activityRows);
 const status=e.resolved?(completion?`対応完了：${esc(actorLabel(completion))} · ${esc(timestamp(completion.occurred_at))}${completion.note?' · '+esc(completion.note):''}`:'対応完了（旧データ：対応者・対応日時は記録されていません）'):'未完了';
 return `<p class="completion-summary">${status}</p><section class="confirmation-history"><h4>確認履歴（${confirmations.length}件）</h4>${activityList(confirmations)}</section><section class="activity-history"><h4>操作履歴（${operations.length}件）</h4>${activityList(operations)}${!list.length?'<p class="small">過去の対応者・対応日時は推測して補っていません。</p>':''}</section>`;
}
function entryCard(e){
 const client=allClients.find(c=>c.id===e.client_id),own=receiptFor(e.id),mine=Rules.active(own),busy=busyEntries.has(e.id),canArchive=e.created_by===session.user.id||membership.role==='admin';
 const primary=e.archived?'':`<div class="note-actions primary-actions no-print" aria-label="主な操作"><button class="mini ${mine?'done':''}" data-primary-action="confirm" ${mine?'disabled aria-label="確認済み"':`onclick="toggleConfirm('${e.id}',false)" ${busy?'disabled':''}`}>${mine?'✓ 確認済み':'確認しました'}</button><button class="mini ${e.resolved?'done':'primary'}" data-primary-action="complete" ${e.resolved?'disabled aria-label="対応済み"':`onclick="openAction('${e.id}','completed')" ${busy?'disabled':''}`}>${e.resolved?'✓ 対応済み':'対応しました'}</button></div>`;
 const secondary=e.archived?(canArchive?`<button class="mini" onclick="transition('${e.id}','restored')" ${busy?'disabled':''}>保管から戻す</button>`:''):`${mine?`<button class="mini" onclick="toggleConfirm('${e.id}',true)" ${busy?'disabled':''}>確認を取り消す</button>`:''}${e.resolved?`<button class="mini" onclick="openAction('${e.id}','reopened')" ${busy?'disabled':''}>対応を再開する</button>`:''}${!e.resolved&&!Rules.carry(e)?`<button class="mini" onclick="transition('${e.id}','carry')" ${busy?'disabled':''}>次の勤務にも残す</button>`:''}${canArchive?`<button class="mini archive-button" onclick="archiveEntry('${e.id}')" ${busy?'disabled':''}>保管する</button>`:''}`;
 return `<article class="note handoff-note ${e.is_important?'important-note ':''}${isUnread(e)?'unread-note ':''}${Rules.carry(e)?'carry ':''}${e.shift==='night'?'night':''}" data-entry-id="${esc(e.id)}"><div class="note-head"><strong>${e.scope==='general'?'全体申し送り':esc(client?clientLabel(client):'退去済み・名称不明の利用者')}</strong><span>${e.shift==='night'?'夜勤':'日勤'} · ${esc(e.service_date)}</span></div><div class="client-meta">${e.is_important?'<span class="badge red">重要</span>':''}${Rules.carry(e)?'<span class="badge amber">継続中</span>':''}${e.archived?'<span class="badge">保管済み</span>':''}${dueBadge(e)}</div><div class="entry-statuses" aria-label="確認と対応の状態"><span class="state-chip ${mine?'complete':'pending'}">${mine?'✓ 自分は確認済み':e.created_by===session.user.id?'自分の投稿':'自分は未確認'}</span><span class="state-chip ${e.resolved?'complete':'pending'}">${e.resolved?'✓ 対応済み':'未対応'}</span></div><div class="note-body">${esc(e.body)}</div><p class="small">投稿：${esc(staffName(e.created_by))} · ${esc(timestamp(e.created_at))}${e.source_label?' · 出典 '+esc(e.source_label):''}</p>${primary}<details class="entry-details" data-entry-details="${esc(e.id)}" ${expandedEntries.has(e.id)?'open':''}><summary>詳細を見る</summary><div class="entry-details-content">${secondary?`<div class="note-actions secondary-actions no-print">${secondary}</div>`:''}${receiptHtml(e)}${eventHtml(e)}</div></details></article>`;
}
document.addEventListener('toggle',event=>{
 const detail=event.target;if(!detail.matches?.('details.entry-details')||!detail.isConnected)return;
 const id=detail.dataset.entryDetails;if(detail.open)expandedEntries.add(id);else expandedEntries.delete(id);
},true);

function render(){
 if(!loaded)return;
 const base=visibleEntries(true),list=visibleEntries(),counts={Unread:base.filter(e=>viewMode==='manage'?Rules.awaiting(e,staffMembers,receiptRows).length>0:isUnread(e)).length,Important:base.filter(e=>e.is_important).length,Carry:base.filter(Rules.carry).length,Overdue:base.filter(e=>Rules.overdue(e)).length};
 for(const [key,count]of Object.entries(counts))$('count'+key).textContent=count;
 $('unreadLabel').textContent=viewMode==='manage'?'未確認者あり':'自分の未確認';
 for(const key of ['All','Unread','Important','Carry'])$('f'+key).classList.toggle('active',filterMode===key.toLowerCase());
 for(const key of ['Unread','Important','Carry','Overdue'])$('metric'+key).classList.toggle('active',filterMode===key.toLowerCase());
 for(const key of ['All','Day','Night'])$('shift'+key).classList.toggle('active',shiftFilter===key.toLowerCase());
 $('summary').textContent=(viewMode==='manage'?'指定期間と継続中':viewMode==='client'?'利用者別の経過':fmtDate(selectedDate))+' · 表示 '+list.length+'件 / 対象 '+base.length+'件';
 if(viewMode==='day'){
  document.querySelector('.generalbox').classList.toggle('hidden',filterMode!=='all'&&!list.some(e=>e.scope==='general'));
  $('generalList').innerHTML=list.filter(e=>e.scope==='general').map(entryCard).join('')||'<p class="empty">全体申し送りはありません。</p>';
  $('clientList').innerHTML=list.filter(e=>e.scope!=='general').map(entryCard).join('')||'<p class="empty">該当する申し送りはありません。</p>';
 }else $('clientTimeline').innerHTML=list.map(entryCard).join('')||'<p class="empty">該当する申し送りはありません。</p>';
}
function setViewMode(mode){
 if(mode==='manage'&&membership?.role!=='admin')return;
 viewMode=mode;for(const [id,value]of [['viewDayBtn','day'],['viewClientBtn','client'],['viewManageBtn','manage']])$(id).classList.toggle('active',mode===value);
 $('dayModeArea').classList.toggle('hidden',mode!=='day');$('clientModeArea').classList.toggle('hidden',mode==='day');$('manageFilters').classList.toggle('hidden',mode!=='manage');
 document.querySelector('.datebar').hidden=mode==='manage';document.querySelector('.client-history-head').hidden=mode==='manage';document.querySelector('.range-switch').hidden=mode==='manage';
 loadEntries();
}
function setHistoryRange(days){historyDays=days;for(const n of [3,7,14])$('range'+n).classList.toggle('active',n===days);loadEntries();}
function changeHistoryClient(id){historyClientId=id;loadEntries();}
function setShift(value){shiftFilter=value;render();}
function setFilter(value){filterMode=value;render();}
function changeDate(value){if(!value)return;selectedDate=value;loadEntries();}
function goToday(){selectedDate=localDate();$('dateInput').value=selectedDate;loadEntries();}
function moveDate(n){const d=new Date(selectedDate+'T12:00:00+09:00');d.setUTCDate(d.getUTCDate()+n);selectedDate=localDate(d);$('dateInput').value=selectedDate;loadEntries();}
function openDetail(cid){historyClientId=cid;$('historyClient').value=cid;setViewMode('client');}
function closeDetail(){hide('detailOverlay');}
function openEntryForSelected(){closeDetail();openEntry(selectedClientId);}
function loadHistory(){setHistoryRange(30);}
function openEntry(cid=null){
 if(entrySaving)return;entryDraftId=crypto.randomUUID();lastEntryPayload=null;selectedCats=new Set();entryShift=shiftFilter==='night'?'night':'day';
 for(const id of ['entryBody','dueDate','dueTime','weightInput','tempInput','spo2Input','bpSysInput','bpDiaInput','pulseInput'])$(id).value='';
 $('important').checked=false;$('carry').checked=false;$('entryStatus').textContent='';
 $('entryClient').value=cid||''; // Never reuse the last selected client for the floating button.
 $('entryOverlay').querySelectorAll('details').forEach(d=>d.open=false);setEntryShift(entryShift);renderCats();bodyCount();updateEntryClientButton();show('entryOverlay');$('entryOverlay').querySelector('.sheet').scrollTop=0;
}
function closeEntry(){if(entrySaving)return;if($('entryBody').value.trim()&&!confirm('入力中の申し送りを破棄しますか？'))return;hide('entryOverlay');}
async function saveEntry(){
 if(entrySaving||!membership)return;const target=$('entryClient').value,body=$('entryBody').value.trim(),dueDate=$('dueDate').value||null,dueTime=$('dueTime').value||null;
 if(!target||!body||[...body].length>500){$('entryStatus').textContent='利用者または全体を選択し、内容を1〜500文字で入力してください。';return;}
 if(target!=='__general__'&&!clients.some(c=>c.id===target)){ $('entryStatus').textContent='利用者を選び直してください。';return;}
 if(dueTime&&!dueDate){$('entryStatus').textContent='対応時刻を入れる場合は対応日も入力してください。';return;}
 const payload={id:entryDraftId||crypto.randomUUID(),organization_id:organization.id,scope:target==='__general__'?'general':'client',client_id:target==='__general__'?null:target,service_date:selectedDate,shift:entryShift,body,categories:[...selectedCats],is_important:$('important').checked,carry_over:$('carry').checked||!!dueDate,resolved:false,due_date:dueDate,due_time:dueTime,created_by:session.user.id};
 // If a response was lost, the same draft ID prevents a duplicate entry. Changed input gets a new ID.
 if(lastEntryPayload&&JSON.stringify({...payload,id:''})!==JSON.stringify({...lastEntryPayload,id:''}))payload.id=entryDraftId=crypto.randomUUID();
 lastEntryPayload=payload;entrySaving=true;$('saveBtn').disabled=true;$('entryStatus').textContent='保存中…';
 try{
  let result=await db.from('handoff_entries').insert(payload).select('id,organization_id,created_by,body,scope,client_id,service_date,shift,categories,is_important,carry_over,due_date,due_time');
  if(result.error?.code==='23505'){
   result=await db.from('handoff_entries').select('*').eq('id',payload.id).eq('organization_id',payload.organization_id);
   const row=requireData(result)[0];
   if(!row||row.created_by!==payload.created_by||Object.keys(payload).some(k=>!['id','created_by','organization_id','due_time'].includes(k)&&JSON.stringify(row[k])!==JSON.stringify(payload[k]))||(row.due_time||'').slice(0,5)!==(payload.due_time||'').slice(0,5))throw Error('同じ保存IDの内容を確認できません。再読み込みしてください。');
  }
  const rows=requireData(result);if(rows.length!==1||rows[0].id!==payload.id||rows[0].organization_id!==payload.organization_id||rows[0].created_by!==payload.created_by)throw Error('保存された申し送りを確認できません。');
  hide('entryOverlay');await loadEntries();
 }catch(error){$('entryStatus').textContent=errorText(error)+' 入力は残しています。';}
 finally{entrySaving=false;$('saveBtn').disabled=false;}
}
async function toggleConfirm(id,isOn){
 const entry=lookupEntry(id);if(!loaded||!entry||busyEntries.has(id))return;
 const own=receiptFor(id),key='confirm:'+id+':'+!isOn;
 const request=pendingRequests.get(key)||{p_org:organization.id,p_entry:id,p_confirmed:!isOn,p_expected_revision:own?.confirmation_revision||0,p_request_id:crypto.randomUUID()};pendingRequests.set(key,request);
 busyEntries.add(id);render();
 try{
  const {data,error}=await db.rpc('handoff_set_confirmation',request);if(error)throw error;
  if(data?.organization_id!==organization.id||data?.entry_id!==id||data?.user_id!==session.user.id)throw Error('確認の保存先を確認できません。');
  pendingRequests.delete(key);await loadEntries();
 }catch(error){if(error.message==='confirmation_conflict'){pendingRequests.delete(key);await loadEntries();}alert(errorText(error));}
 finally{busyEntries.delete(id);render();}
}
function openAction(id,action){
 const e=lookupEntry(id);if(!loaded||!e||busyEntries.has(id))return;
 actionDraft={id,action,revision:e.workflow_revision,requestId:crypto.randomUUID(),org:organization.id};
 $('actionNote').readOnly=false;
 $('actionTitle').textContent=action==='completed'?'対応完了にする':'対応を再開する';$('actionDescription').textContent=e.body;$('actionNote').value='';$('actionStatus').textContent='';$('actionSave').disabled=false;
 $('actionDialog').showModal();$('actionNote').focus();
}
function closeAction(){if(actionDraft&&busyEntries.has(actionDraft.id))return;actionDraft=null;$('actionDialog').close();}
$('actionDialog').addEventListener('cancel',event=>{if(actionDraft&&busyEntries.has(actionDraft.id))event.preventDefault();else actionDraft=null;});
$('actionForm').onsubmit=async event=>{
 event.preventDefault();if(!actionDraft)return;const draft=actionDraft;
 $('actionSave').disabled=true;$('actionStatus').textContent='保存中…';
 draft.note??=$('actionNote').value.trim();$('actionNote').readOnly=true;
 const ok=await transition(draft.id,draft.action,draft.note,draft);
 if(ok){actionDraft=null;$('actionDialog').close();}
 else if(actionDraft&&!actionDraft.stale)$('actionSave').disabled=false;
};
async function transition(id,action,note='',draft=null){
 const e=lookupEntry(id);if(!loaded||!e||busyEntries.has(id))return false;
 const key='state:'+id+':'+action;
 const request=draft?{p_org:draft.org,p_entry:id,p_action:action,p_expected_revision:draft.revision,p_request_id:draft.requestId,p_note:note.trim()}:(pendingRequests.get(key)||{p_org:organization.id,p_entry:id,p_action:action,p_expected_revision:e.workflow_revision,p_request_id:crypto.randomUUID(),p_note:note.trim()});
 if([...request.p_note].length>300){$('actionStatus').textContent='対応内容は300文字までです。';return false;}
 pendingRequests.set(key,request);busyEntries.add(id);render();
 try{
  const {data,error}=await db.rpc('handoff_transition',request);if(error)throw error;
  if(data?.entry?.id!==id||data.entry.organization_id!==organization.id||!Number.isSafeInteger(data.entry.workflow_revision))throw Error('対応の保存先を確認できません。');
  pendingRequests.delete(key);await loadEntries();savedFeedback(actionLabels[action]+'を保存しました。',data.entry);return true;
 }catch(error){
  if(['workflow_conflict','entry_archived','entry_not_found'].includes(error.message)){pendingRequests.delete(key);if(draft)draft.stale=true;await loadEntries();}
  if(draft)$('actionStatus').textContent=errorText(error)+(draft.stale?' 一度閉じて最新の状態から開き直してください。':' 入力は残しています。');else alert(errorText(error));
  return false;
 }finally{busyEntries.delete(id);render();}
}
function savedFeedback(message,entry){lastSavedEntry=entry;const box=$('operationStatus');box.replaceChildren(document.createTextNode(message));if(entry&&!entry.archived){const button=document.createElement('button');button.className='btn';button.textContent='この申し送りの履歴';button.onclick=()=>{if(lastSavedEntry?.organization_id!==organization.id)return;selectedDate=lastSavedEntry.service_date;$('dateInput').value=selectedDate;filterMode='all';shiftFilter='all';if(lastSavedEntry.client_id){historyClientId=lastSavedEntry.client_id;$('historyClient').value=historyClientId;setViewMode('client');}else setViewMode('day');};box.append(button);}box.hidden=false;}
function archiveEntry(id){if(confirm('履歴を残したまま、この申し送りを通常の一覧から保管しますか？ 管理者の確認画面から戻せます。'))transition(id,'archived');}
function openAdminSettings(){if(membership?.role!=='admin')return;show('adminCard');$('adminCard').scrollIntoView({behavior:'smooth',block:'start'});}
function clearHandoffData(){++loadVersion;entries=[];receiptRows=[];activityRows=[];actionDraft=null;lastEntryPayload=null;lastSavedEntry=null;$('operationStatus').hidden=true;entrySaving=false;pendingRequests.clear();busyEntries.clear();expandedEntries.clear();for(const id of ['entryBody','actionNote'])$(id).value='';hide('entryOverlay');$('actionDialog').close();for(const id of ['clientList','generalList','clientTimeline'])$(id).replaceChildren();}
function refresh(){if(membership&&!document.hidden&&!hasDraft()&&!busyEntries.size){loadStaff().then(()=>loadEntries()).catch(error=>{$('summary').textContent=errorText(error);});}}
window.addEventListener('pageshow',e=>{if(e.persisted)refresh();});
document.addEventListener('visibilitychange',refresh);
window.addEventListener('beforeunload',e=>{if(hasDraft()||entrySaving||busyEntries.size){e.preventDefault();e.returnValue='';}});
db.auth.onAuthStateChange((event,s)=>{if(event==='SIGNED_OUT'){clearHandoffData();session=null;location.replace('../home/');}});
init();

function printPdf(){
 const w=window.open("","_blank"); if(!w){alert("ポップアップを許可してください。");return}
 function entryHtml(e){
   const due=e.due_date?' <b>【対応 '+esc(e.due_date)+(e.due_time?' '+String(e.due_time).slice(0,5):'')+'】</b>':'';
   return '<div class="'+(e.shift==="night"?"night":"day")+'"><b>'+(e.shift==="night"?"夜勤":"日勤")+'</b> '+fmtTime(e.created_at)+' '+esc(entryStaff(e))+'　'+esc(e.body).replace(/\n/g,"<br>")+(e.is_important?' <b>【重要】</b>':'')+due+(Rules.carry(e)?' <b>【継続】</b>':'')+'</div>';
 }
 function pageRows(list){
   return list.map(c=>{
     const es=entries.filter(e=>e.scope!=="general"&&e.client_id===c.id);
     return '<tr><th>'+esc(clientLabel(c))+'</th><td>'+es.map(entryHtml).join("")+'</td></tr>';
   }).join("");
 }
 const printClients=allClients.filter(c=>c.is_active||entries.some(e=>e.client_id===c.id));
 const p1=printClients.filter(c=>["101","201","202","203","204","205","206","301","302"].includes((c.room_number||c.code)));
 const p2=printClients.filter(c=>!["101","201","202","203","204","205","206","301","302"].includes((c.room_number||c.code)));
 const general=entries.filter(e=>e.scope==="general").map(entryHtml).join("")||"";
 const css='@page{size:A4 portrait;margin:7mm}body{font-family:-apple-system,BlinkMacSystemFont,"Noto Sans JP",sans-serif;font-size:9.5pt;margin:0}h1{font-size:15pt;text-align:center;margin:0 0 5px}.page{min-height:270mm;page-break-after:always}.page:last-child{page-break-after:auto}.meta{font-size:8.5pt;color:#555;margin-bottom:5px}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{border:1px solid #555;padding:5px;vertical-align:top;min-height:20mm}th{width:23%;text-align:center}.night{color:#c32645;margin:2px 0}.day{color:#111;margin:2px 0}.remarks{border:1px solid #555;padding:6px;min-height:20mm;margin-top:-1px}.remarks b{display:block;margin-bottom:4px}';
 const page=(rows,n,remarks)=>'<section class="page"><h1>申し送り　'+esc(fmtDate(selectedDate))+'</h1><div class="meta">'+esc(organization?.name||"")+'　'+n+'ページ目</div><table>'+rows+'</table><div class="remarks"><b>（備考・全体申し送り）</b>'+remarks+'</div></section>';
 w.document.write('<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>申し送り '+selectedDate+'</title><style>'+css+'</style></head><body>'+page(pageRows(p1),'1 / 2','')+page(pageRows(p2),'2 / 2',general)+'</body></html>');
 w.document.close();setTimeout(()=>{w.focus();w.print()},250);
}

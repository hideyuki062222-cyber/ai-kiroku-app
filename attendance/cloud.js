/* Shared attendance. No workbook, employee data, or drafts are persisted in browser storage. */
const attendanceDBClient=supabase.createClient('https://pagamoaxhqszojxrpxyu.supabase.co','sb_publishable_GQFRQYCo2oACYAh9lj9ZyA_JqfIPJGT');
let cloudUser,cloudOrg,cloudMemberships=[],cloudOrgs=[],cloudStaff=[],cloudRecords=new Map(),cloudPaths=new Map(),cloudBaseline='',cloudBusy=false,cloudReady=false;
const cloudPeriod=()=>`${$('year').value}-${String($('month').value).padStart(2,'0')}-01`;
const cloudAdmin=()=>cloudMemberships.find(m=>m.organization_id===cloudOrg?.id)?.role==='admin';
const cloudPayload=()=>{remember();return sheets.map(s=>({staff:cloudPaths.get(s.path),draft:drafts[s.path]})).filter(x=>x.staff&&x.draft)};
// DOM controls return strings; compare normalized dates so navigation is not an edit.
const cloudSignature=()=>JSON.stringify(cloudPayload().map(({staff,draft})=>({staff,draft:{...draft,year:Number(draft.year),month:Number(draft.month)}})));
const cloudDirty=()=>cloudReady&&cloudSignature()!==cloudBaseline;
function cloudStatus(message){$('cloudNotice').textContent=message;$('autosaveStatus').textContent=message;}
function cloudLock(value){cloudBusy=value;document.body.classList.toggle('cloud-busy',value);for(const id of ['cloudSave','cloudReload','cloudOrg','cloudPrint','export','upload'])$(id).disabled=value;}
function cloudCheck(result){if(result.error)throw Error(result.error.message);return result.data;}
async function cloudAll(query){let data=[],page=0;while(true){const batch=cloudCheck(await query.range(page*500,page*500+499));data.push(...batch);if(batch.length<500)return data;page++;}}
async function cloudBuild(period,records,preferred){
 cloudReady=false;document.getElementById('importReview')?.remove();settings={addedStaff:[],removedStaff:[],shifts:structuredClone(defaultShifts),offices:[{id:'current',name:cloudOrg.name}],staffOffices:{}};
 const response=await fetch('blank-template.xlsx');if(!response.ok)throw Error('Excel様式を読み込めません。');
 await loadWorkbookBytes(new Uint8Array(await response.arrayBuffer()),'出勤簿.xlsx',true);
 if(!files||!sheets.length)throw Error('出勤簿様式を確認してください。');
 cloudPaths.clear();cloudRecords=new Map(records.map(r=>[r.staff_id,r]));
 for(let i=0;i<cloudStaff.length;i++){
  const person=cloudStaff[i],index=i===0?0:createStaffSheet(person.staff_name,person.employment_type||'');const sheet=sheets[index];
  const doc=xml(files[sheet.path]);put(doc,'F5',person.staff_name);put(doc,'H5',person.employment_type||'');put(doc,'C5',person.office_label||cloudOrg.name);writeXml(sheet.path,doc);
  cloudPaths.set(sheet.path,person.id);settings.staffOffices[person.staff_name]='current';
 }
 current=null;drafts={};monthDrafts={};const [year,month]=period.split('-');$('year').value=year;$('month').value=Number(month);
 for(const sheet of sheets){const record=cloudRecords.get(cloudPaths.get(sheet.path));const draft={year,month:Number(month),rows:record?structuredClone(record.rows):Array.from({length:31},()=>pick('')),memo:record?.memo||''};drafts[sheet.path]=draft;archiveDraft(sheet.path,draft);}
 selectedOffice='all';refreshStaffChoices(Math.max(0,cloudStaff.findIndex(s=>s.id===preferred)));loadStaff(false);
 $('office').closest('label').hidden=true;$('staff').closest('label').hidden=!cloudAdmin();document.querySelector('.staff-nav').hidden=!cloudAdmin();
 $('upload').closest('details').hidden=!cloudAdmin();document.getElementById('legacyAttendanceLink')?.remove();if(cloudAdmin()){const p=document.createElement('p');p.id='legacyAttendanceLink';p.innerHTML='<strong>初回移行：</strong>旧版で入力済みのデータはまだ自動転送されません。<a href="https://kizuna-attendance-e77cd1.hideyuki062222.chatgpt.site" target="_blank" rel="noopener">旧KIZUNA出勤簿を開く</a> → 入力に使った端末でExcelを保存 → この画面で取り込んでください。過去月が複数ある場合は各月を保存してください。';$('upload').closest('details').prepend(p);}$('export').textContent=cloudAdmin()?'表示月・全スタッフのExcelを保存':'自分のExcelを保存';
 for(const [i,option]of [...$('staff').options].entries()){const person=cloudStaff[i];option.textContent=person.staff_name+(person.is_active?'':'（停止中）');}syncCalendarStaff();
 $('saveInfo').textContent='「変更を保存」でクラウドに保存します。年月・スタッフを確認してください。過去の旧版データは管理者によるExcel移行が必要です。';
 cloudReady=true;document.body.classList.add('attendance-ready');cloudBaseline=cloudSignature();cloudStatus('保存済みの内容を読み込みました。');$('cloudGate').hidden=true;$('cloudControls').hidden=false;
}
async function cloudLoad(period=cloudPeriod(),preferred){
 cloudLock(true);try{
  let q=attendanceDBClient.from('organization_staff').select('id,staff_name,linked_user_id,is_active,office_label,employment_type,sort_order').eq('organization_id',cloudOrg.id).order('sort_order').order('id');
  if(!cloudAdmin())q=q.eq('linked_user_id',cloudUser.id).eq('is_active',true);
  cloudStaff=await cloudAll(q);if(!cloudStaff.length)throw Error('本人と職員の紐付けが未設定、または利用停止中です。管理者に職員管理の確認を依頼してください。');
  if(!cloudAdmin()&&cloudStaff.length!==1)throw Error('本人の職員情報を一意に確認できません。管理者に連絡してください。');
  const records=await cloudAll(attendanceDBClient.from('attendance_months').select('*').eq('organization_id',cloudOrg.id).eq('period',period).order('staff_id'));
  await cloudBuild(period,records,preferred);
 }catch(e){cloudReady=false;document.body.classList.remove('attendance-ready');$('work').hidden=true;$('cloudGate').hidden=false;$('cloudStatus').textContent=e.message;throw e;}finally{cloudLock(false);}
}
async function cloudWrite(person,period,draft,prior){
 for(const r of draft.rows){const error=validRow(r);if(error)throw Error(error);}
 const data={organization_id:cloudOrg.id,staff_id:person,period,rows:draft.rows,memo:draft.memo||''};
 let query=prior?attendanceDBClient.from('attendance_months').update({rows:data.rows,memo:data.memo}).eq('organization_id',cloudOrg.id).eq('staff_id',person).eq('period',period).eq('revision',prior.revision):attendanceDBClient.from('attendance_months').insert(data);
 const saved=cloudCheck(await query.select('*'));if(saved.length!==1)throw Error('別の端末で変更されたか、権限が変更されました。入力をExcelに退避してから再読み込みしてください。');return saved[0];
}
async function cloudSave(){
 if(!cloudReady||cloudBusy)return false;cloudLock(true);let count=0;
 try{const period=cloudPeriod();for(const {staff,draft}of cloudPayload()){
  const old=cloudRecords.get(staff);const blank=Array.from({length:31},()=>pick(''));
  if(JSON.stringify(draft.rows)===JSON.stringify(old?.rows||blank)&&draft.memo===(old?.memo||''))continue;
  const saved=await cloudWrite(staff,period,draft,old);cloudRecords.set(staff,saved);count++;
 }cloudBaseline=cloudSignature();cloudStatus('クラウドに保存しました。'+new Date().toLocaleTimeString('ja-JP'));return true;
 }catch(e){cloudStatus(`${count}人分を保存。残りは保存できませんでした：${e.message} 未保存の入力は画面に残っています。`);return false;}finally{cloudLock(false);}
}
async function cloudCanLeave(){if(!cloudDirty())return true;return confirm('未保存の変更があります。破棄して移動しますか？（保存する場合はキャンセルしてください）');}
$('cloudSave').onclick=cloudSave;
$('cloudReload').onclick=async()=>{if(await cloudCanLeave())await cloudLoad(cloudPeriod(),cloudPaths.get(current?.path)).catch(e=>cloudStatus(e.message));};
for(const id of ['year','month'])$(id).onchange=async()=>{
 const year=$('year').value,month=$('month').value;$('year').value=shownYear;$('month').value=shownMonth;
 if(!Number.isInteger(+year)||+year<2000||+year>2100||+month<1||+month>12){alert('年月を確認してください。');return;}
 if(!await cloudCanLeave())return;cloudLoad(`${year}-${String(month).padStart(2,'0')}-01`,cloudPaths.get(current?.path)).catch(e=>cloudStatus(e.message));
};
$('cloudOrg').onchange=async()=>{const id=$('cloudOrg').value;$('cloudOrg').value=cloudOrg.id;if(!await cloudCanLeave())return;cloudOrg=cloudOrgs.find(o=>o.id===id);localStorage.setItem('activeOrganizationId',id);$('cloudOrg').value=id;cloudLoad().catch(e=>cloudStatus(e.message));};
// Existing export renderer is preserved, but its input consists only of server-authorized staff.
const legacyExport=$('export').onclick;
$('export').onclick=()=>{if(!cloudReady||cloudBusy)return;if(cloudDirty()&&!confirm('未保存の入力を含めてExcelに退避しますか？クラウド保存は別途必要です。'))return;legacyExport();};
$('cloudPrint').onclick=()=>{
 if(!cloudReady||cloudBusy)return;const draft=cloudPayload().find(x=>x.staff===cloudPaths.get(current.path)).draft;const person=cloudStaff.find(s=>s.id===cloudPaths.get(current.path));
 $('printSheet').innerHTML=`<h1>出勤簿 ${esc(draft.year)}年${esc(draft.month)}月</h1><h2>${esc(person.staff_name)}</h2><p>${esc(person.office_label||cloudOrg.name)}</p><table style="width:100%;border-collapse:collapse" border="1"><thead><tr><th>日</th><th>勤務</th><th>始業</th><th>終業</th><th>休憩</th><th>区分</th><th>備考</th></tr></thead><tbody>${draft.rows.slice(0,size()).map((r,i)=>`<tr><td>${i+1}</td><td>${esc(settings.shifts[r.t]?.name||r.t)}</td><td>${r.s==null?'':hm(r.s)}</td><td>${r.e==null?'':(r.e>=1440?'翌':'')+hm(r.e%1440)}</td><td>${r.s==null?'':r.b}</td><td style="background:${rowYellow(r,'G')?'#ffff00':'white'}">${esc(r.g)}</td><td style="background:${rowYellow(r,'H')?'#ffff00':'white'}">${esc(r.h)}</td></tr>`).join('')}</tbody></table><p>${esc(draft.memo)}</p>`;window.print();
};
window.addEventListener('beforeunload',e=>{if(cloudDirty()||cloudBusy){e.preventDefault();e.returnValue='';}});
document.addEventListener('click',e=>{const a=e.target.closest('a[href]');if(a&&cloudDirty()&&!confirm('未保存の変更があります。破棄して移動しますか？'))e.preventDefault();});
for(const event of ['input','change','click','submit'])document.addEventListener(event,()=>queueMicrotask(()=>{if(cloudReady&&!cloudBusy&&cloudDirty())cloudStatus('未保存の変更があります。「変更を保存」を押してください。');}));
attendanceDBClient.auth.onAuthStateChange((event,session)=>{if(cloudUser&&(!session||session.user.id!==cloudUser.id)){cloudReady=false;document.querySelector('main').replaceChildren();location.reload();}});
(async()=>{try{
 const authResult=await attendanceDBClient.auth.getUser();if(authResult.error||!authResult.data?.user)throw Error('AI記録と同じアカウントでログインしてください。');cloudUser=authResult.data.user;
 cloudMemberships=cloudCheck(await attendanceDBClient.from('organization_members').select('organization_id,role').eq('user_id',cloudUser.id));
 cloudOrgs=cloudCheck(await attendanceDBClient.from('organizations').select('id,name,is_active').in('id',cloudMemberships.map(m=>m.organization_id)).eq('is_active',true));
 cloudOrg=cloudOrgs.find(o=>o.id===localStorage.getItem('activeOrganizationId'))||cloudOrgs[0];if(!cloudOrg)throw Error('利用できる事業所がありません。');
 $('cloudOrg').replaceChildren(...cloudOrgs.map(o=>new Option(o.name,o.id)));$('cloudOrg').value=cloudOrg.id;
 const jst=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit'}).format(new Date());await cloudLoad(jst+'-01');
}catch(e){$('cloudStatus').textContent=e.message;$('work').hidden=true;}})();
// Import only after an administrator reviews each sheet-to-staff mapping.
$('upload').onchange=async()=>{
 if(!cloudReady||cloudBusy||!cloudAdmin())return;const file=$('upload').files[0];if(!file)return;
 if(cloudDirty()){alert('先に変更を保存するか、Excelに退避して再読み込みしてください。');return;}
 cloudLock(true);try{
  if(file.size>20*1024*1024)throw Error('Excelは20MB以下にしてください。');
  const incoming=await unzip(new Uint8Array(await file.arrayBuffer()));const oldFiles=files,oldStrings=strings;const incomingRows=[];
  try{files=incoming;strings=incoming['xl/sharedStrings.xml']?nodes(xml(incoming['xl/sharedStrings.xml']),'si').map(x=>x.textContent):[];
   const workbook=xml(incoming['xl/workbook.xml']),rels=[...xml(incoming['xl/_rels/workbook.xml.rels']).documentElement.children];
   for(const sheet of nodes(workbook,'sheet')){
    let path=rels.find(r=>r.getAttribute('Id')===sheet.getAttribute('r:id'))?.getAttribute('Target');if(!path)continue;path=path.startsWith('/')?path.slice(1):'xl/'+path;if(!incoming[path])continue;
    const doc=xml(incoming[path]);if(value(doc,'A5')!=='所属'||!value(doc,'F5'))continue;
    const year=+value(doc,'A3'),month=+value(doc,'D3');if(!Number.isInteger(year)||year<2000||year>2100||!Number.isInteger(month)||month<1||month>12)throw Error('Excel内の年月を確認してください。');
    const rs=Array.from({length:31},(_,i)=>{const n=i+10,r=pick(''),s=value(doc,'C'+n),e=value(doc,'D'+n);r.g=value(doc,'G'+n);r.h=value(doc,'H'+n);r.night=value(doc,'I'+n);r.yellowOther=sheetCellIsYellow(doc,'G'+n);r.yellowNote=sheetCellIsYellow(doc,'H'+n);if(s!==''&&e!==''){r.s=mins(s);r.e=mins(e);if(r.e<r.s)r.e+=1440;r.b=mins(value(doc,'E'+n)||0);r.t=Object.keys(settings.shifts).find(k=>settings.shifts[k].s===r.s&&settings.shifts[k].e===r.e)||'custom';}else r.t=r.g in types?r.g:r.h.startsWith('明')?'明け':'';const error=validRow(r);if(error)throw Error(`${i+1}日：${error}`);return r;});
    incomingRows.push({name:value(doc,'F5'),sheet:sheet.getAttribute('name'),period:`${year}-${String(month).padStart(2,'0')}-01`,draft:{year,month,rows:rs,memo:value(doc,'C44')}});
   }
  }finally{files=oldFiles;strings=oldStrings;}
  if(!incomingRows.length)throw Error('KIZUNA出勤簿のシートがありません。');
  document.getElementById('importReview')?.remove();const review=document.createElement('section');review.id='importReview';review.className='panel';
  review.innerHTML='<h2>Excel移行の確認</h2><p>元のExcelは変更しません。取り込むシートを職員に対応付けてください。同姓同名は職員IDも確認してください。空欄は取り込みません。</p>'+incomingRows.map((r,i)=>`<label style="margin:12px 0">${esc(r.name)} ／ ${esc(r.period.slice(0,7))} ／ ${esc(r.sheet)}<select data-import="${i}"><option value="">取り込まない</option>${cloudStaff.map(s=>`<option value="${s.id}">${esc(s.staff_name)} [${s.id.slice(0,6)}]</option>`).join('')}</select></label>`).join('')+'<label><input id="importConfirmed" type="checkbox">本人との対応を確認した</label><button id="importCommit">取り込み前バックアップを保存して移行</button><button id="importCancel">キャンセル</button><p id="importStatus" role="status"></p>';
  $('cloudControls').after(review);$('importCancel').onclick=()=>review.remove();
  $('importCommit').onclick=async()=>{
   if(cloudBusy||!cloudAdmin()||!$('importConfirmed').checked)return;const selected=[...review.querySelectorAll('[data-import]')].filter(x=>x.value).map(x=>({...incomingRows[+x.dataset.import],staff:x.value}));
   if(!selected.length)return alert('取り込む職員を選択してください。');if(new Set(selected.map(x=>x.staff+'|'+x.period)).size!==selected.length)return alert('同じ職員・月が複数選択されています。');
   cloudLock(true);$('importCommit').disabled=true;let completed=0;
   try{
    const before=[];for(const item of selected){const old=cloudCheck(await attendanceDBClient.from('attendance_months').select('*').eq('organization_id',cloudOrg.id).eq('staff_id',item.staff).eq('period',item.period));before.push(old[0]||null);}
    const existing=before.filter(Boolean).length;if(existing&&!confirm(`${existing}件は保存済み出勤簿があります。バックアップを保存したうえで置き換えますか？`))return;
    download(new Blob([JSON.stringify({format:'kizuna-migration-backup-v1',organization_id:cloudOrg.id,created_at:new Date().toISOString(),before,incoming:selected},null,2)],{type:'application/json'}),'KIZUNA_移行前バックアップ.json');
    for(let i=0;i<selected.length;i++){const item=selected[i];await cloudWrite(item.staff,item.period,item.draft,before[i]);completed++;}
    review.remove();await cloudLoad();cloudStatus(`${completed}件の出勤簿を移行しました。元のExcelとバックアップを保管してください。`);
   }catch(e){$('importStatus').textContent=`${completed}件を保存しました。残りは未移行です：${e.message}`;}finally{cloudLock(false);if($('importCommit'))$('importCommit').disabled=false;}
  };
 }catch(e){alert('取り込めませんでした：'+e.message);}finally{cloudLock(false);$('upload').value='';}
};

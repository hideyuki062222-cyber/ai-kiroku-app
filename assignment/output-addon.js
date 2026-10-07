(()=>{
const q=s=>document.querySelector(s), esc2=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
function fmt(t){return String(t||'').slice(0,5).replace(/^0/,'')}
function mins(t){const [h,m]=String(t||'').slice(0,5).split(':').map(Number);return h*60+m}
function clientText(c){return `${c.code}${c.display_name?` ${c.display_name}`:''}`}
function addUi(){
 if(q('#assignmentOutputCard'))return;
 const actions=q('#reloadBtn')?.parentElement;
 if(actions){const b=document.createElement('button');b.className='secondary';b.id='jumpOutputBtn';b.textContent='利用者別出力';actions.appendChild(b);}
 const card=document.createElement('section');card.className='assignment-output-card';card.id='assignmentOutputCard';card.innerHTML=`<div class="no-print"><label>利用者別 担当表出力</label><div class="notice">利用者と対象月を選ぶと、1か月分の担当者・メモ・記録済み状況を一覧表示します。A4縦で印刷またはPDF保存できます。</div><div class="assignment-output-controls" style="margin-top:12px"><div><label>利用者</label><select id="assignmentOutputClient"></select></div><div><label>対象月</label><input id="assignmentOutputMonth" type="month"></div></div><div class="actions"><button class="primary" id="assignmentOutputRefresh">一覧を表示</button><button class="secondary" id="assignmentOutputPrint">A4縦で印刷 / PDF保存</button></div><div id="assignmentOutputStatus" class="notice"></div></div><div id="assignmentPrintTitle" class="assignment-output-title"></div><div class="assignment-output-wrap"><table id="assignmentOutputTable" class="assignment-output-table"><thead id="assignmentOutputHead"></thead><tbody id="assignmentOutputBody"></tbody></table></div>`;
 const settings=q('#scheduleSettingsCard'); if(settings)settings.before(card); else q('.wrap')?.appendChild(card);
 q('#assignmentOutputMonth').value=new Date().toISOString().slice(0,7);
 q('#jumpOutputBtn')?.addEventListener('click',()=>{card.scrollIntoView({behavior:'smooth',block:'start'});renderOutput().catch(showOutputError)});
 q('#assignmentOutputRefresh').onclick=()=>renderOutput().catch(showOutputError);
 q('#assignmentOutputClient').onchange=()=>renderOutput().catch(showOutputError);
 q('#assignmentOutputMonth').onchange=()=>renderOutput().catch(showOutputError);
 q('#assignmentOutputPrint').onclick=async()=>{try{await renderOutput();window.print()}catch(e){showOutputError(e)}};
}
function fillClients(){
 if(typeof clients==='undefined'||!Array.isArray(clients))return false;
 const sel=q('#assignmentOutputClient');if(!sel)return false;
 const current=sel.value, sig=clients.map(c=>c.id).join('|');
 if(sel.dataset.sig===sig)return clients.length>0;
 sel.dataset.sig=sig;sel.innerHTML=clients.map(c=>`<option value="${c.id}">${esc2(clientText(c))}</option>`).join('');
 if(current&&clients.some(c=>c.id===current))sel.value=current;else if(clients[0])sel.value=clients[0].id;
 return clients.length>0;
}
function rangeForMonth(ym){
 const [y,m]=ym.split('-').map(Number); const start=`${y}-${String(m).padStart(2,'0')}-01`; const ny=m===12?y+1:y, nm=m===12?1:m+1; const end=`${ny}-${String(nm).padStart(2,'0')}-01`; const days=new Date(y,m,0).getDate(); return {y,m,start,end,days};
}
async function renderOutput(){
 addUi(); if(typeof organization==='undefined'||!organization)throw new Error('事業所情報を読み込み中です'); if(!fillClients())throw new Error('利用者情報を読み込み中です');
 const cid=q('#assignmentOutputClient').value, ym=q('#assignmentOutputMonth').value||new Date().toISOString().slice(0,7), c=clients.find(x=>x.id===cid); if(!c)return;
 q('#assignmentOutputStatus').textContent='読み込み中…'; const {y,m,start,end,days}=rangeForMonth(ym);
 const clientSlots=slots.filter(s=>s.client_id===cid&&s.is_active).sort((a,b)=>mins(a.service_time)-mins(b.service_time));
 const timePairs=[...new Map(clientSlots.map(s=>[fmt(s.service_time),s])).entries()];
 const [ar,rr]=await Promise.all([
  sb.from('staff_assignments').select('id,service_date,service_time,assigned_staff_name,memo').eq('organization_id',organization.id).eq('client_id',cid).gte('service_date',start).lt('service_date',end),
  sb.from('care_records').select('id,assignment_id,service_date,service_time').eq('organization_id',organization.id).eq('client_id',cid).gte('service_date',start).lt('service_date',end)
 ]);
 if(ar.error)throw ar.error;if(rr.error)throw rr.error; const aa=ar.data||[], rec=rr.data||[], doneIds=new Set(rec.map(r=>r.assignment_id).filter(Boolean));
 q('#assignmentPrintTitle').textContent=`${clientText(c)}　${y}年${m}月 担当表`;
 q('#assignmentOutputHead').innerHTML='<tr><th>日付</th><th>曜</th>'+timePairs.map(([time])=>`<th>${esc2(time)}</th>`).join('')+'</tr>';
 const dows=['日','月','火','水','木','金','土']; let body='';
 for(let d=1;d<=days;d++){
  const date=`${ym}-${String(d).padStart(2,'0')}`, dow=new Date(date+'T12:00:00').getDay(); body+=`<tr><td>${m}/${d}</td><td>${dows[dow]}</td>`;
  for(const [time,slot] of timePairs){
   if(!(slot.days_of_week||[]).includes(dow)){body+='<td class="na">—</td>';continue;}
   const a=aa.find(x=>x.service_date===date&&fmt(x.service_time)===time); if(!a){body+='<td></td>';continue;} const done=doneIds.has(a.id);
   body+=`<td><div class="staff">${esc2(a.assigned_staff_name||'')}</div><div class="recorded-mark"${done?'':' style="color:#b42318"'}>${done?'✓記録済':'未記録'}</div>${a.memo?`<div class="memo">${esc2(a.memo)}</div>`:''}</td>`;
  }
  body+='</tr>';
 }
 q('#assignmentOutputBody').innerHTML=body; q('#assignmentOutputTable').style.setProperty('--print-row-h',(days>=31?7.35:days===30?7.55:days===29?7.8:8.05)+'mm');
 q('#assignmentOutputStatus').textContent=`${days}日分 / 担当登録 ${aa.length}件 / 記録済 ${aa.filter(a=>doneIds.has(a.id)).length}件 / 未記録 ${aa.filter(a=>!doneIds.has(a.id)).length}件`;
}
function showOutputError(e){console.error(e);const s=q('#assignmentOutputStatus');if(s)s.textContent='出力データを読み込めませんでした。再読み込みしてください。'}
addUi(); let attempts=0; const timer=setInterval(()=>{attempts++;if(fillClients()){if(!q('#assignmentOutputBody').children.length)renderOutput().catch(()=>{});if(attempts>10)clearInterval(timer)}else if(attempts>30)clearInterval(timer)},1000);
})();
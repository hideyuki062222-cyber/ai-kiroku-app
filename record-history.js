(()=>{
 let serial=0;
 const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
 const japanToday=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 window.renderClientRecordHistory=async(db,member)=>{
  const host=document.getElementById('history');if(!host)return;
  const token=++serial,oldOrg=host.dataset.org,previous=host.querySelector('select')?.value,previousDate=host.querySelector('#recordHistoryDate')?.value;
  host.replaceChildren();if(!member)return;host.dataset.org=member.organization_id;
  const current=()=>token===serial&&host.isConnected;
  const label=el('label','利用者を選択');label.htmlFor='recordHistoryClient';const select=el('select');select.id='recordHistoryClient';
  const dateLabel=el('label','サービス予定日');dateLabel.htmlFor='recordHistoryDate';const date=el('input');date.type='date';date.id='recordHistoryDate';date.value=oldOrg===member.organization_id&&previousDate?previousDate:japanToday();
  const hint=el('p','担当割当から正式保存した記録を、サービス予定日・予定時間で表示します。記録のある日を選び、時間を押してください。');hint.className='notice';
  const toolbar=el('div');toolbar.style.cssText='display:flex;align-items:center;justify-content:space-between;gap:8px;margin:12px 0';
  const prev=el('button','前の月'),next=el('button','次の月'),monthTitle=el('strong');prev.type=next.type='button';toolbar.append(prev,monthTitle,next);
  const calendar=el('div');calendar.id='recordHistoryCalendar';calendar.style.cssText='display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px';
  const status=el('p');status.setAttribute('role','status');const list=el('div'),refresh=el('button','記録を更新');refresh.type='button';
  host.append(label,select,hint,dateLabel,date,toolbar,calendar,refresh,status,list);
  let month=date.value.slice(0,7),request=0,dayRequest=0,counts=new Map();
  const base=()=>db.from('care_records').select('id,service_date,service_time,assignment_id').eq('organization_id',member.organization_id).eq('client_id',select.value).not('assignment_id','is',null).not('service_time','is',null);
  function draw(){
   calendar.replaceChildren();monthTitle.textContent=month.replace('-','年')+'月';
   for(const name of ['日','月','火','水','木','金','土']){const cell=el('div',name);cell.style.textAlign='center';calendar.append(cell);}
   const [y,m]=month.split('-').map(Number),first=new Date(y,m-1,1).getDay(),days=new Date(y,m,0).getDate();
   for(let i=0;i<first;i++)calendar.append(el('span'));
   for(let n=1;n<=days;n++){
    const key=month+'-'+String(n).padStart(2,'0'),count=counts.get(key)||0,button=el('button');button.type='button';button.dataset.date=key;button.setAttribute('aria-label',key+' '+count+'件');button.setAttribute('aria-pressed',String(date.value===key));
    button.style.cssText='min-height:54px;min-width:0;padding:6px 1px;border-radius:8px;font-size:13px;border:2px solid '+(date.value===key?'#2563eb':'transparent')+';background:'+(count?'#e0edff':'#f3f4f6')+';color:#172033';
    button.append(el('div',String(n)),el('small',count?count+'件':'—'));button.onclick=()=>{date.value=key;draw();loadDay();};calendar.append(button);
   }
  }
  async function loadDay(){
   const seq=++dayRequest,id=select.value,chosen=date.value;list.replaceChildren();
   if(!id||!chosen){status.textContent='利用者と予定日を選択してください。';return;}
   status.textContent='記録を読み込んでいます…';
   try{
    let rows=[],offset=0;
    while(true){
     const {data,error}=await db.from('care_records').select('id,assignment_id,service_date,service_time,service_type,visit_note,care_note,created_at').eq('organization_id',member.organization_id).eq('client_id',id).eq('service_date',chosen).not('assignment_id','is',null).not('service_time','is',null).order('service_time',{ascending:true}).order('id',{ascending:true}).range(offset,offset+499);
     if(!current()||seq!==dayRequest)return;if(error)throw error;rows.push(...(data||[]));if((data||[]).length<500)break;offset+=500;
    }
    const groups=new Map();for(const row of rows){const key=String(row.service_time).slice(0,5);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);}
    for(const [time,records]of groups){
     const details=el('details');details.className='history-item';const summary=el('summary',time+' ／ '+records.length+'件');summary.style.cssText='padding:16px 4px;cursor:pointer;font-weight:700';details.append(summary);
     records.forEach((row,i)=>{const article=el('article');article.style.cssText='border-top:1px solid #ddd;padding:12px 0;overflow-wrap:anywhere';article.append(el('strong',chosen+' '+time+' ／ 記録'+(i+1)+(row.service_type?' ／ '+row.service_type:'')));
      for(const [title,value]of [['訪問時の状態・様子・体調',row.visit_note],['支援中・介護者が実施したこと',row.care_note]]){article.append(el('h3',title));const p=el('p',value||'記載なし');p.style.cssText='white-space:pre-wrap;line-height:1.8';article.append(p);}
      const saved=el('small','保存日時：'+new Date(row.created_at).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'}));article.append(saved);details.append(article);
     });list.append(details);
    }
    status.textContent=chosen+'：'+(rows.length?groups.size+'枠・'+rows.length+'件（サービス予定時間順）':'担当割当から保存された記録はありません。');
   }catch(e){if(current()&&seq===dayRequest)status.textContent='記録を読み込めませんでした。「記録を更新」で再試行してください。';}
  }
  async function loadMonth(){
   const seq=++request;++dayRequest;counts=new Map();list.replaceChildren();draw();
   if(!select.value){status.textContent='利用者を選択してください。';return;}
   status.textContent='カレンダーを読み込んでいます…';const [y,m]=month.split('-').map(Number);const end=new Date(Date.UTC(y,m,1)).toISOString().slice(0,10);
   try{
    const found=new Map();let offset=0;
    while(true){const {data,error}=await base().gte('service_date',month+'-01').lt('service_date',end).order('id',{ascending:true}).range(offset,offset+499);
     if(!current()||seq!==request)return;if(error)throw error;for(const r of data||[])found.set(r.service_date,(found.get(r.service_date)||0)+1);if((data||[]).length<500)break;offset+=500;
    }
    counts=found;draw();await loadDay();
   }catch(e){if(current()&&seq===request)status.textContent='カレンダーを読み込めませんでした。「記録を更新」で再試行してください。';}
  }
  const shift=delta=>{const [y,m]=month.split('-').map(Number);month=new Date(Date.UTC(y,m-1+delta,1)).toISOString().slice(0,7);date.value=month+'-01';return loadMonth();};
  prev.onclick=()=>shift(-1);next.onclick=()=>shift(1);refresh.onclick=()=>loadMonth();select.onchange=()=>loadMonth();date.onchange=()=>{if(!date.value)return;const changed=month!==date.value.slice(0,7);month=date.value.slice(0,7);draw();return changed?loadMonth():loadDay();};draw();
  try{
   const {data,error}=await db.from('clients').select('id,code,display_name,is_active').eq('organization_id',member.organization_id).order('code');
   if(!current())return;if(error)throw error;select.append(new Option('利用者を選択',''));
   for(const c of data||[])select.append(new Option(c.code+(c.display_name?' '+c.display_name:'')+(c.is_active?'':'（利用終了）'),c.id));
   const chosen=oldOrg===member.organization_id&&data?.some(c=>c.id===previous)?previous:data?.find(c=>c.code===document.getElementById('user')?.value)?.id;
   select.value=chosen||'';await loadMonth();
  }catch(e){if(current())status.textContent='利用者を読み込めませんでした。画面を再読み込みしてください。';}
 };
})();

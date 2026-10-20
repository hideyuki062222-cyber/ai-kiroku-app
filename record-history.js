(()=>{
 let serial=0;
 const openedTargets=new Set();
 const link=new URLSearchParams(location.search);
 const targetId=link.get('from')==='record'?link.get('record'):null;
 const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
 const copyControl=(label,text)=>{
  const wrap=el('div'),button=el('button',label),status=el('span');
  button.type='button';button.style.cssText='margin:6px 8px 6px 0;min-height:44px';status.setAttribute('role','status');
  button.onclick=async()=>{
   button.disabled=true;status.textContent='';wrap.querySelector('textarea')?.remove();
   try{
    if(!navigator.clipboard?.writeText)throw new Error('clipboard unavailable');
    await navigator.clipboard.writeText(text);status.textContent='コピーしました';
   }catch(e){
    status.textContent='自動コピーできませんでした。下の文章を選択してコピーしてください。';
    const field=el('textarea');field.value=text;field.readOnly=true;field.setAttribute('aria-label',label+'用の文章');field.style.cssText='width:100%;min-height:120px';wrap.append(field);field.focus();field.select();
   }finally{button.disabled=false;}
  };wrap.append(button,status);return wrap;
 };
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
  let month=date.value.slice(0,7),request=0,dayRequest=0,counts=new Map(),targetRecord=null;
  let revealTarget=!!targetId&&!openedTargets.has(member.organization_id+'|'+targetId);
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
     const {data,error}=await db.from('care_records').select('id,assignment_id,service_date,service_time,service_type,visit_note,care_note,created_at,created_by').eq('organization_id',member.organization_id).eq('client_id',id).eq('service_date',chosen).not('assignment_id','is',null).not('service_time','is',null).order('service_time',{ascending:true}).order('id',{ascending:true}).range(offset,offset+499);
     if(!current()||seq!==dayRequest)return;if(error)throw error;rows.push(...(data||[]));if((data||[]).length<500)break;offset+=500;
    }
    // Older records without assignment_id are shown only when opened by their exact ID.
    if(targetRecord&&!targetRecord.assignment_id&&targetRecord.client_id===id&&targetRecord.service_date===chosen){
     const legacy=await db.from('care_records').select('id,client_id,assignment_id,service_date,service_time,service_type,visit_note,care_note,created_at,created_by').eq('organization_id',member.organization_id).eq('client_id',id).eq('service_date',chosen).eq('id',targetRecord.id).maybeSingle();
     if(!current()||seq!==dayRequest)return;if(legacy.error)throw legacy.error;
     if(legacy.data&&!rows.some(r=>r.id===legacy.data.id))rows.push(legacy.data);
    }
    rows.sort((a,b)=>String(a.service_time).localeCompare(String(b.service_time))||String(a.id).localeCompare(String(b.id)));
    const authors=new Map(),authorIds=[...new Set(rows.map(r=>r.created_by).filter(Boolean))];
    for(let i=0;i<authorIds.length;i+=100){
     try{
      const result=await db.from('organization_members').select('user_id,staff_name').eq('organization_id',member.organization_id).in('user_id',authorIds.slice(i,i+100));
      if(!current()||seq!==dayRequest)return;
      if(!result.error)for(const person of result.data||[])if(person.staff_name?.trim())authors.set(person.user_id,person.staff_name.trim());
     }catch(e){/* Keep the records visible; never substitute the assigned staff member. */}
    }
    if(!current()||seq!==dayRequest)return;
    const groups=new Map();for(const row of rows){const key=String(row.service_time).slice(0,5);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);}
    for(const [time,records]of groups){
     const details=el('details');details.className='history-item';const summary=el('summary',time+' ／ '+records.length+'件');summary.style.cssText='padding:16px 4px;cursor:pointer;font-weight:700';details.append(summary);
     records.forEach((row,i)=>{const article=el('article');article.style.cssText='border-top:1px solid #ddd;padding:12px 0;overflow-wrap:anywhere';article.dataset.recordId=row.id;article.append(el('strong',chosen+' '+time+' ／ 記録'+(i+1)+(row.service_type?' ／ '+row.service_type:'')));
      article.append(el('p','記録者：'+(authors.get(row.created_by)||'確認できません（退職・氏名未登録など）')));
      for(const [title,value]of [['訪問時の状態・様子・体調',row.visit_note],['支援中・介護者が実施したこと',row.care_note]]){article.append(el('h3',title));const p=el('p',value||'記載なし');p.style.cssText='white-space:pre-wrap;line-height:1.8';article.append(p);if(value)article.append(copyControl(title+'をコピー',value));}
      article.append(copyControl('この記録をまとめてコピー','【訪問時】\n'+(row.visit_note||'')+'\n\n【支援中】\n'+(row.care_note||'')));
      const saved=el('small','保存日時：'+new Date(row.created_at).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'}));article.append(saved);details.append(article);
      if(row.id===targetId){
       details.open=true;article.classList.add('record-target');article.tabIndex=-1;article.style.cssText+=';border:3px solid #2563eb;border-radius:12px;background:#eff6ff;padding:14px;scroll-margin-top:24px';
       const marker=el('p','✓ 今日の担当から開いた記録');marker.style.cssText='font-weight:800;color:#1d4ed8';article.prepend(marker);
      }
     });list.append(details);
    }
    const target=[...list.querySelectorAll('[data-record-id]')].find(n=>n.dataset.recordId===targetId);
    if(revealTarget&&target){
     revealTarget=false;openedTargets.add(member.organization_id+'|'+targetId);
     requestAnimationFrame(()=>{if(current()&&seq===dayRequest&&target.isConnected){target.focus({preventScroll:true});target.scrollIntoView({block:'start',behavior:'auto'});}});
    }
    if(revealTarget&&!target){status.textContent='指定された保存済み記録を確認できません。今日の担当から開き直してください。';return;}
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
   if(revealTarget){
    const result=await db.from('care_records').select('id,client_id,assignment_id,service_date,service_time,service_type,visit_note,care_note,created_at,created_by').eq('organization_id',member.organization_id).eq('id',targetId).maybeSingle();
    if(!current())return;
    const row=result.data,person=data?.find(c=>c.id===row?.client_id);
    if(result.error||!row||!person||!row.service_date||!row.service_time||(link.get('assignment')&&row.assignment_id&&row.assignment_id!==link.get('assignment'))){
     status.textContent='指定された保存済み記録を確認できません。削除・閲覧権限・選択中の事業所を確認し、今日の担当から開き直してください。';
     host.tabIndex=-1;host.focus({preventScroll:true});host.scrollIntoView({block:'start'});return;
    }
    targetRecord=row;select.value=person.id;date.value=row.service_date;month=date.value.slice(0,7);
    const userSelect=document.getElementById('user');
    if(userSelect&&[...userSelect.options].some(o=>o.value===person.code)){userSelect.value=person.code;userSelect.dispatchEvent(new Event('change',{bubbles:true}));}
    await loadMonth();return;
   }
   const chosen=oldOrg===member.organization_id&&data?.some(c=>c.id===previous)?previous:data?.find(c=>c.code===document.getElementById('user')?.value)?.id;
   select.value=chosen||'';await loadMonth();
  }catch(e){if(current())status.textContent='利用者を読み込めませんでした。画面を再読み込みしてください。';}
 };
})();

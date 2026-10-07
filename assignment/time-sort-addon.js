(()=>{
  const parseMinutes=(text)=>{
    const m=String(text||'').trim().match(/^(\d{1,2}):(\d{2})$/);
    if(!m)return 9999;
    return Number(m[1])*60+Number(m[2]);
  };
  const phase=(mins)=>mins<240?'深夜　0:00 ～ 3:59':mins<1020?'朝・日中　4:00 ～ 16:59':'夕方・夜間　17:00 ～ 23:59';
  let sorting=false;
  function ensureBadge(schedule){
    if(document.getElementById('timeOrderBadge'))return;
    const badge=document.createElement('div');
    badge.id='timeOrderBadge';
    badge.textContent='時刻順表示　0:00 → 23:59';
    badge.style.cssText='margin:0 0 10px;padding:8px 10px;border-radius:10px;background:#ecfdf3;color:#166534;font-size:12px;font-weight:900;border:1px solid #bbf7d0';
    schedule.parentElement?.insertBefore(badge,schedule);
  }
  function sortSchedule(){
    if(sorting)return;
    const schedule=document.getElementById('schedule');
    if(!schedule)return;
    const rows=[...schedule.querySelectorAll('.time-row')];
    if(!rows.length){ensureBadge(schedule);return;}
    sorting=true;
    try{
      ensureBadge(schedule);
      const ordered=rows.map(row=>({row,mins:parseMinutes(row.querySelector('.time-box')?.textContent)})).sort((a,b)=>a.mins-b.mins);
      schedule.querySelectorAll('.section-title').forEach(x=>x.remove());
      let last='';
      for(const item of ordered){
        const p=phase(item.mins);
        if(p!==last){
          const title=document.createElement('div');
          title.className='section-title';
          title.textContent=p;
          schedule.appendChild(title);
          last=p;
        }
        schedule.appendChild(item.row);
      }
    }finally{sorting=false;}
  }
  function boot(){
    const schedule=document.getElementById('schedule');
    if(!schedule){setTimeout(boot,120);return;}
    sortSchedule();
    const mo=new MutationObserver(()=>{if(!sorting)requestAnimationFrame(sortSchedule)});
    mo.observe(schedule,{childList:true,subtree:false});
    document.getElementById('assignDate')?.addEventListener('change',()=>setTimeout(sortSchedule,250));
    document.getElementById('reloadBtn')?.addEventListener('click',()=>setTimeout(sortSchedule,500));
    setTimeout(sortSchedule,700);
    setTimeout(sortSchedule,1600);
  }
  boot();
})();

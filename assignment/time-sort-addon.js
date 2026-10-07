(()=>{
  const parseMinutes=(text)=>{
    const m=String(text||'').trim().match(/^(\d{1,2}):(\d{2})$/);
    if(!m)return 9999;
    return Number(m[1])*60+Number(m[2]);
  };
  const phase=(mins)=>mins<240?'深夜　0:00 ～ 3:59':mins<1020?'朝・日中　4:00 ～ 16:59':'夕方・夜間　17:00 ～ 23:59';
  let observer=null;
  function watch(schedule){
    if(!observer)observer=new MutationObserver(()=>requestAnimationFrame(sortSchedule));
    observer.observe(schedule,{childList:true,subtree:false});
  }
  function ensureBadge(schedule){
    if(document.getElementById('timeOrderBadge'))return;
    const badge=document.createElement('div');
    badge.id='timeOrderBadge';
    badge.textContent='時刻順表示　0:00 → 23:59';
    badge.style.cssText='margin:0 0 10px;padding:8px 10px;border-radius:10px;background:#ecfdf3;color:#166534;font-size:12px;font-weight:900;border:1px solid #bbf7d0';
    schedule.parentElement?.insertBefore(badge,schedule);
  }
  function sortSchedule(){
    const schedule=document.getElementById('schedule');
    if(!schedule)return;
    const rows=[...schedule.querySelectorAll('.time-row')];
    ensureBadge(schedule);
    if(!rows.length)return;
    const ordered=rows.map(row=>({row,mins:parseMinutes(row.querySelector('.time-box')?.textContent)})).sort((a,b)=>a.mins-b.mins);
    const current=rows.map(x=>parseMinutes(x.querySelector('.time-box')?.textContent));
    const desired=ordered.map(x=>x.mins);
    const titles=[...schedule.querySelectorAll('.section-title')].map(x=>x.textContent.trim());
    const expected=[...new Set(desired.map(phase))];
    const alreadySorted=current.every((v,i)=>v===desired[i])&&titles.length===expected.length&&titles.every((v,i)=>v===expected[i]);
    if(alreadySorted)return;
    observer?.disconnect();
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
    watch(schedule);
  }
  function boot(){
    const schedule=document.getElementById('schedule');
    if(!schedule){setTimeout(boot,120);return;}
    sortSchedule();
    watch(schedule);
    document.getElementById('assignDate')?.addEventListener('change',()=>setTimeout(sortSchedule,250));
    document.getElementById('reloadBtn')?.addEventListener('click',()=>setTimeout(sortSchedule,500));
    setTimeout(sortSchedule,700);
    setTimeout(sortSchedule,1600);
  }
  boot();
})();

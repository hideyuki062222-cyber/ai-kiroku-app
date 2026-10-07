(()=>{
  const waitForApp=()=>{
    const schedule=document.getElementById('schedule');
    const mainStaff=document.getElementById('staffSelect');
    const mainSave=document.getElementById('saveSelectedBtn');
    const mainClear=document.getElementById('clearSelectedBtn');
    if(!schedule||!mainStaff||!mainSave||!mainClear||typeof selected==='undefined'||typeof slots==='undefined'||typeof findAssignment!=='function'){
      setTimeout(waitForApp,120);return;
    }

    if(document.getElementById('assignmentQuickBar')) return;
    const bar=document.createElement('div');
    bar.id='assignmentQuickBar';
    bar.innerHTML=`
      <div class="assignment-quick-head">
        <div class="assignment-quick-count" id="assignmentQuickCount">0件選択中</div>
        <div class="assignment-quick-hint">このまま担当者を選んで登録できます</div>
      </div>
      <div class="assignment-quick-controls">
        <select id="assignmentQuickStaff" aria-label="担当者"><option value="">担当者を選択</option></select>
        <button type="button" id="assignmentQuickSave">担当登録</button>
        <button type="button" id="assignmentQuickClear">選択解除</button>
      </div>`;
    document.body.appendChild(bar);

    const quickStaff=document.getElementById('assignmentQuickStaff');
    const quickSave=document.getElementById('assignmentQuickSave');
    const quickClear=document.getElementById('assignmentQuickClear');

    function syncOptions(){
      const keep=quickStaff.value||mainStaff.value||'';
      quickStaff.innerHTML=mainStaff.innerHTML;
      if([...quickStaff.options].some(o=>o.value===keep)) quickStaff.value=keep;
      if(quickStaff.value) mainStaff.value=quickStaff.value;
    }
    function syncBar(){
      syncOptions();
      const n=selected.size;
      document.getElementById('assignmentQuickCount').textContent=`${n}件選択中`;
      bar.classList.toggle('show',n>0);
      document.body.classList.toggle('assignment-quick-open',n>0);
    }

    quickStaff.addEventListener('change',()=>{mainStaff.value=quickStaff.value;});
    mainStaff.addEventListener('change',()=>{quickStaff.value=mainStaff.value;});
    quickSave.addEventListener('click',()=>{
      if(!quickStaff.value){alert('担当者を選択してください。');quickStaff.focus();return;}
      mainStaff.value=quickStaff.value;
      mainSave.click();
      setTimeout(syncBar,100);
      setTimeout(syncBar,700);
    });
    quickClear.addEventListener('click',()=>{mainClear.click();setTimeout(syncBar,0);});

    // Intercept taps on unassigned slots before the original click handler.
    // This avoids rebuilding the whole schedule, so the scroll position and typed memo stay intact.
    schedule.addEventListener('click',e=>{
      if(e.target.closest('input,button,select,textarea,a')) return;
      const el=e.target.closest('.slot[data-slot]');
      if(!el||!schedule.contains(el)) return;
      const slot=slots.find(s=>s.id===el.dataset.slot);
      if(!slot||findAssignment(slot)) return; // keep existing edit behavior for assigned slots
      e.stopPropagation();
      if(selected.has(slot.id)) selected.delete(slot.id); else selected.add(slot.id);
      el.classList.toggle('selected',selected.has(slot.id));
      syncBar();
    },true);

    // When the app reloads the schedule after save/date change, update the bar without moving the page.
    const mo=new MutationObserver(()=>requestAnimationFrame(syncBar));
    mo.observe(schedule,{childList:true,subtree:true});
    const staffMo=new MutationObserver(syncOptions);
    staffMo.observe(mainStaff,{childList:true});
    mainClear.addEventListener('click',()=>setTimeout(syncBar,0));
    document.getElementById('assignDate')?.addEventListener('change',()=>setTimeout(syncBar,0));
    syncBar();
  };
  waitForApp();
})();

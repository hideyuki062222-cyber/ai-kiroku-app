(()=>{
  const waitForApp=()=>{
    const schedule=document.getElementById('schedule');
    const mainStaff=document.getElementById('staffSelect');
    const mainSave=document.getElementById('saveSelectedBtn');
    const mainClear=document.getElementById('clearSelectedBtn');
    const assignDate=document.getElementById('assignDate');
    if(!schedule||!mainStaff||!mainSave||!mainClear||typeof selected==='undefined'||typeof slots==='undefined'||typeof findAssignment!=='function'){
      setTimeout(waitForApp,120);return;
    }
    if(document.getElementById('assignmentQuickBar')) return;

    const header=document.querySelector('header');
    if(header&&!document.getElementById('assignmentUxBadge')){
      const badge=document.createElement('div');
      badge.id='assignmentUxBadge';
      badge.textContent='スマホ操作改善版：下のバーだけで担当登録できます';
      header.appendChild(badge);
    }

    const bar=document.createElement('div');
    bar.id='assignmentQuickBar';
    bar.innerHTML=`
      <div class="assignment-quick-head">
        <div class="assignment-quick-count" id="assignmentQuickCount">利用者を選択してください</div>
        <div class="assignment-quick-hint">上に戻らず、その場で登録できます</div>
      </div>
      <div class="assignment-quick-controls">
        <select id="assignmentQuickStaff" aria-label="担当者"><option value="">担当者を選択</option></select>
        <button type="button" id="assignmentQuickSave" disabled>担当登録</button>
        <button type="button" id="assignmentQuickClear">選択解除</button>
      </div>`;
    document.body.appendChild(bar);
    document.body.classList.add('assignment-quick-ready');

    const quickStaff=document.getElementById('assignmentQuickStaff');
    const quickSave=document.getElementById('assignmentQuickSave');
    const quickClear=document.getElementById('assignmentQuickClear');
    const quickCount=document.getElementById('assignmentQuickCount');

    function preferredStaff(){
      const remembered=localStorage.getItem('assignmentLastStaffId')||'';
      const selfId=(typeof session!=='undefined'&&session?.user?.id)||'';
      return quickStaff.value||mainStaff.value||remembered||selfId;
    }
    function syncOptions(){
      const keep=preferredStaff();
      quickStaff.innerHTML=mainStaff.innerHTML;
      if([...quickStaff.options].some(o=>o.value===keep)){
        quickStaff.value=keep;
        mainStaff.value=keep;
      }
    }
    function syncBar(){
      syncOptions();
      const n=selected.size;
      quickCount.textContent=n?`${n}件選択中・このまま担当登録できます`:'利用者をタップして選択してください';
      quickSave.disabled=n===0;
    }
    function rememberStaff(value){
      if(value)localStorage.setItem('assignmentLastStaffId',value);
    }

    quickStaff.addEventListener('change',()=>{
      mainStaff.value=quickStaff.value;
      rememberStaff(quickStaff.value);
    });
    mainStaff.addEventListener('change',()=>{
      quickStaff.value=mainStaff.value;
      rememberStaff(mainStaff.value);
    });

    quickSave.addEventListener('click',()=>{
      if(!selected.size)return;
      if(!quickStaff.value){alert('担当者を選択してください。');quickStaff.focus();return;}
      mainStaff.value=quickStaff.value;
      rememberStaff(quickStaff.value);
      const y=window.scrollY;
      mainSave.click();
      // loadAll() rebuilds the list after saving; keep the worker at the same place.
      [80,250,700].forEach(ms=>setTimeout(()=>{window.scrollTo({top:y,left:0,behavior:'auto'});syncBar();},ms));
    });
    quickClear.addEventListener('click',()=>{
      mainClear.click();
      setTimeout(syncBar,0);
    });

    // Handle taps before the original slot handler. No full re-render on select/unselect.
    schedule.addEventListener('click',e=>{
      if(e.target.closest('input,button,select,textarea,a')) return;
      const el=e.target.closest('.slot[data-slot]');
      if(!el||!schedule.contains(el)) return;
      const slot=slots.find(s=>s.id===el.dataset.slot);
      if(!slot||findAssignment(slot)) return; // existing assigned-slot edit behavior stays as-is
      e.stopPropagation();
      if(selected.has(slot.id)) selected.delete(slot.id); else selected.add(slot.id);
      el.classList.toggle('selected',selected.has(slot.id));
      syncBar();
    },true);

    const scheduleObserver=new MutationObserver(()=>requestAnimationFrame(syncBar));
    scheduleObserver.observe(schedule,{childList:true,subtree:true});
    const staffObserver=new MutationObserver(syncOptions);
    staffObserver.observe(mainStaff,{childList:true});
    mainClear.addEventListener('click',()=>setTimeout(syncBar,0));
    assignDate?.addEventListener('change',()=>setTimeout(syncBar,0));
    syncBar();
  };
  waitForApp();
})();

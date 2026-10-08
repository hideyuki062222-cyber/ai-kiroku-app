(()=>{
  let roster=[];
  const wait=()=>{
    if(typeof sb==='undefined'||typeof organization==='undefined'||typeof members==='undefined'||typeof selected==='undefined'||typeof slots==='undefined'||typeof loadAll!=='function'||typeof fillStaff!=='function'||!document.getElementById('staffSelect')){setTimeout(wait,120);return;}
    boot();
  };
  async function boot(){
    const mainStaff=document.getElementById('staffSelect');
    const editStaff=document.getElementById('editStaff');
    const mainSave=document.getElementById('saveSelectedBtn');
    const editSave=document.getElementById('saveEditBtn');
    if(!organization?.id){setTimeout(boot,180);return;}

    fillStaff=function(){
      const account='<option value="">担当者を選択</option>'+members.map(m=>`<option value="${m.user_id}">${esc(staffName(m))}</option>`).join('');
      const activeOffline=roster.filter(x=>x.is_active).map(x=>`<option value="offline:${x.id}">${esc(x.staff_name)}（ログインなし）</option>`).join('');
      const allOffline=roster.map(x=>`<option value="offline:${x.id}">${esc(x.staff_name)}（ログインなし${x.is_active?'':'・停止中'}）</option>`).join('');
      mainStaff.innerHTML=account+activeOffline;
      editStaff.innerHTML=account+allOffline;
    };

    async function loadRoster(){
      const {data,error}=await sb.from('organization_staff').select('id,staff_name,is_active,sort_order').eq('organization_id',organization.id).order('is_active',{ascending:false}).order('sort_order').order('staff_name');
      if(error){console.warn('offline staff load failed',error);return;}
      roster=data||[];fillStaff();
      document.dispatchEvent(new CustomEvent('offlineStaffLoaded'));
    }
    function resolve(value){
      if(String(value).startsWith('offline:')){
        const id=String(value).slice(8),s=roster.find(x=>x.id===id);
        return s?{assigned_user_id:null,assigned_staff_id:s.id,assigned_staff_name:s.staff_name}:null;
      }
      const m=members.find(x=>x.user_id===value);
      return m?{assigned_user_id:value,assigned_staff_id:null,assigned_staff_name:staffName(m)}:null;
    }

    mainSave.onclick=async()=>{
      const value=mainStaff.value;if(!value)return alert('担当者を選択してください。');if(!selected.size)return alert('利用者を選択してください。');
      const who=resolve(value);if(!who)return alert('担当者情報を読み込めませんでした。最新情報に更新してください。');
      const date=document.getElementById('assignDate').value;
      const rows=[...selected].map(id=>{const s=slots.find(x=>x.id===id);return {organization_id:organization.id,client_id:s.client_id,service_date:date,service_time:s.service_time,assigned_user_id:who.assigned_user_id,assigned_staff_id:who.assigned_staff_id,assigned_staff_name:who.assigned_staff_name,memo:document.querySelector(`[data-memo="${id}"]`)?.value?.trim()||'',created_by:session.user.id,updated_by:session.user.id};});
      const {error}=await sb.from('staff_assignments').upsert(rows,{onConflict:'organization_id,client_id,service_date,service_time'});
      if(error)return alert('登録できませんでした：'+error.message);
      selected.clear();await loadAll();
    };

    // 元の openEdit は (assignment, slot) の2引数。ここを崩すと全担当の編集が開けなくなる。
    const originalOpen=typeof openEdit==='function'?openEdit:null;
    if(originalOpen){
      openEdit=function(a,slot){
        originalOpen(a,slot);
        if(a?.assigned_staff_id){
          editStaff.value='offline:'+a.assigned_staff_id;
        }else if(a?.assigned_user_id){
          editStaff.value=a.assigned_user_id;
        }
      };
    }

    editSave.onclick=async()=>{
      if(!editing)return;
      const value=editStaff.value;if(!value)return alert('担当者を選択してください。');
      const who=resolve(value);if(!who)return alert('担当者情報を読み込めませんでした。');
      const {error}=await sb.from('staff_assignments').update({assigned_user_id:who.assigned_user_id,assigned_staff_id:who.assigned_staff_id,assigned_staff_name:who.assigned_staff_name,memo:document.getElementById('editMemo').value.trim(),updated_by:session.user.id,updated_at:new Date().toISOString()}).eq('id',editing.a.id);
      if(error)return alert('修正できませんでした：'+error.message);
      closeEdit();await loadAll();
    };

    document.getElementById('reloadBtn')?.addEventListener('click',()=>setTimeout(loadRoster,350));
    await loadRoster();
  }
  wait();
})();

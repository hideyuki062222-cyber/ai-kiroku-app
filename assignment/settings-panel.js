(()=>{
  function boot(){
    const clientSettings=document.getElementById('clientSettings');
    const topActions=document.querySelector('.wrap > .card .actions')||document.querySelector('.card .actions');
    if(!clientSettings||!topActions){setTimeout(boot,120);return;}
    if(document.getElementById('scheduleSettingsOverlay'))return;

    const settingsCard=clientSettings.closest('.card');
    if(!settingsCard){setTimeout(boot,120);return;}

    const button=document.createElement('button');
    button.type='button';
    button.id='scheduleSettingsToggle';
    button.textContent='⚙ 利用者・時間設定';
    topActions.appendChild(button);

    const staffLink=document.createElement('a');
    staffLink.id='offlineStaffManageLink';
    staffLink.href='../staff/';
    staffLink.textContent='👥 職員管理';
    staffLink.style.cssText='display:none;align-items:center;text-decoration:none;background:#eef2f7;color:#344054;border-radius:9px;padding:9px 11px;font-size:12px;font-weight:900;white-space:nowrap';
    topActions.appendChild(staffLink);

    const overlay=document.createElement('div');
    overlay.id='scheduleSettingsOverlay';
    overlay.innerHTML=`<div id="scheduleSettingsSheet" role="dialog" aria-modal="true" aria-labelledby="scheduleSettingsSheetTitle"><div id="scheduleSettingsSheetHead"><div id="scheduleSettingsSheetTitle">利用者・サービス時間設定</div><button type="button" id="scheduleSettingsClose">閉じる</button></div></div>`;
    document.body.appendChild(overlay);
    document.getElementById('scheduleSettingsSheet').appendChild(settingsCard);

    const open=()=>{overlay.classList.add('open');document.body.classList.add('schedule-settings-open');document.getElementById('scheduleSettingsSheet').scrollTop=0;};
    const close=()=>{overlay.classList.remove('open');document.body.classList.remove('schedule-settings-open');};
    button.addEventListener('click',open);
    document.getElementById('scheduleSettingsClose').addEventListener('click',close);
    overlay.addEventListener('click',e=>{if(e.target===overlay)close();});
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&overlay.classList.contains('open'))close();});

    function applyRole(){
      try{
        if(typeof membership==='undefined'||!membership)return false;
        const admin=membership.role==='admin';
        button.style.display=admin?'inline-flex':'none';
        staffLink.style.display=admin?'inline-flex':'none';
        if(!admin)close();
        return true;
      }catch(e){return false;}
    }
    if(!applyRole()){
      let tries=0;
      const timer=setInterval(()=>{tries++;if(applyRole()||tries>50)clearInterval(timer);},200);
    }
  }
  boot();
})();

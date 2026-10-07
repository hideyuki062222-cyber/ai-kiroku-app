(()=>{
  const VERSION='2026.10.07-15';
  const $=s=>document.querySelector(s);
  function reloadFresh(){
    const u=new URL(location.href);
    u.searchParams.set('v',Date.now());
    location.replace(u.toString());
  }
  function addChip(ok){
    if(document.getElementById('assignmentReleaseChip'))return;
    const chip=document.createElement('span');
    chip.id='assignmentReleaseChip';
    chip.textContent=`公開版 ${VERSION}${ok?' ✓':''}`;
    chip.style.cssText='display:inline-flex;align-items:center;padding:4px 7px;border-radius:999px;font-size:10px;font-weight:900;background:'+(ok?'#ecfdf3':'#fff1f2')+';color:'+(ok?'#166534':'#b42318')+';border:1px solid '+(ok?'#bbf7d0':'#fecdd3');
    const summary=$('.summary');
    if(summary)summary.appendChild(chip);
  }
  function showError(missing){
    if(document.getElementById('assignmentReleaseError'))return;
    const box=document.createElement('div');
    box.id='assignmentReleaseError';
    box.style.cssText='position:sticky;top:6px;z-index:7000;margin:8px auto;padding:10px 12px;width:min(760px,calc(100% - 16px));background:#fff1f2;color:#9f1239;border:1px solid #fecdd3;border-radius:12px;font-size:12px;font-weight:800;box-shadow:0 8px 24px #0002';
    box.innerHTML=`更新の一部が読み込めていません（${VERSION}）。<button type="button" id="assignmentFreshReload" style="margin-left:8px;border:0;border-radius:8px;padding:7px 10px;background:#9f1239;color:#fff;font-weight:900">最新版を再読込</button><div style="font-size:10px;margin-top:4px;font-weight:600">不足: ${missing.join(' / ')}</div>`;
    document.body.prepend(box);
    $('#assignmentFreshReload').onclick=reloadFresh;
    addChip(false);
  }
  function verify(){
    const missing=[];
    if(!$('#assignmentQuickBar'))missing.push('担当登録バー');
    if(!$('#timeOrderBadge'))missing.push('時刻順表示');
    if(!$('#scheduleSettingsOverlay'))missing.push('設定パネル');
    if(!$('#scheduleSettingsToggle'))missing.push('設定ボタン');
    if(missing.length)showError(missing);else addChip(true);
  }
  let tries=0;
  const timer=setInterval(()=>{
    tries++;
    if($('#schedule')&&($('#assignmentQuickBar')||tries>=25)){
      clearInterval(timer);
      setTimeout(verify,700);
    }
    if(tries>=40){clearInterval(timer);verify();}
  },200);
})();

(()=>{
  const styleId='staffCompactStyle';
  function addStyle(){
    if(document.getElementById(styleId))return;
    const s=document.createElement('style');
    s.id=styleId;
    s.textContent=`
      #staffAdminCard .staff-list{gap:6px!important}
      #staffAdminCard .staff-row.staff-compact{display:block!important;padding:9px 10px!important;background:#fff!important;border:1px solid #e6eaf0!important}
      #staffAdminCard .staff-compact-head{display:flex;align-items:center;justify-content:space-between;gap:8px}
      #staffAdminCard .staff-compact-name{min-width:0;font-weight:900;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      #staffAdminCard .staff-compact-badges{display:flex;align-items:center;gap:5px;flex:0 0 auto}
      #staffAdminCard .staff-compact-badge{display:inline-flex;align-items:center;padding:3px 7px;border-radius:999px;background:#eef2f7;color:#475467;font-size:10px;font-weight:900}
      #staffAdminCard .staff-compact-badge.admin{background:#fff3d6;color:#8a5700}
      #staffAdminCard .staff-compact-toggle{border:0;background:#eef2f7;color:#344054;border-radius:8px;padding:6px 9px;font-size:11px;font-weight:900;cursor:pointer}
      #staffAdminCard .staff-compact-detail{display:none;margin-top:8px;padding-top:8px;border-top:1px solid #edf0f4;font-size:12px;color:#667085;line-height:1.65}
      #staffAdminCard .staff-row.staff-compact.open .staff-compact-detail{display:block}
      #staffAdminCard .staff-compact-detail .detail-line{word-break:break-all;margin:2px 0}
      #staffAdminCard .staff-compact-detail .danger{margin-top:7px;padding:7px 10px;font-size:11px}
      #staffAdminCard .staff-row.staff-compact>.staff-meta,#staffAdminCard .staff-row.staff-compact>button.danger{display:none!important}
      @media(max-width:650px){#staffAdminCard .staff-row.staff-compact{padding:8px 9px!important}#staffAdminCard .staff-compact-name{font-size:13px}#staffAdminCard .staff-compact-toggle{padding:5px 8px}}
    `;
    document.head.appendChild(s);
  }
  function parseIdentity(text){
    const raw=String(text||'').trim();
    const i=raw.lastIndexOf('（');
    if(i>0&&raw.endsWith('）')){
      const left=raw.slice(0,i).trim();
      const inside=raw.slice(i+1,-1).trim();
      if(inside==='職員名未登録') return {name:'職員名未登録',email:left};
      return {name:left||'職員名未登録',email:inside||'メールアドレス未設定'};
    }
    return {name:raw||'職員名未登録',email:'メールアドレス未設定'};
  }
  function compactRow(row){
    if(row.classList.contains('staff-compact'))return;
    const emailEl=row.querySelector('.staff-email');
    const roleEl=row.querySelector('.staff-role');
    if(!emailEl||!roleEl)return;
    const identity=parseIdentity(emailEl.textContent);
    const roleText=(roleEl.textContent||'').trim();
    const role=roleText.split(' / ')[0]||'一般職員';
    const isSelf=roleText.includes('あなた');
    const joinedPart=roleText.split(' / ').find(x=>x.startsWith('参加:'))||'';
    const removeBtn=[...row.children].find(el=>el.tagName==='BUTTON'&&el.classList.contains('danger'))||null;

    const head=document.createElement('div');
    head.className='staff-compact-head';
    const name=document.createElement('div');
    name.className='staff-compact-name';
    name.textContent=identity.name;
    const badges=document.createElement('div');
    badges.className='staff-compact-badges';
    const roleBadge=document.createElement('span');
    roleBadge.className='staff-compact-badge'+(role==='管理者'?' admin':'');
    roleBadge.textContent=role;
    badges.appendChild(roleBadge);
    if(isSelf){const b=document.createElement('span');b.className='staff-compact-badge';b.textContent='あなた';badges.appendChild(b);}
    const toggle=document.createElement('button');
    toggle.type='button';toggle.className='staff-compact-toggle';toggle.textContent='詳細';toggle.setAttribute('aria-expanded','false');
    head.append(name,badges,toggle);

    const detail=document.createElement('div');
    detail.className='staff-compact-detail';
    const mail=document.createElement('div');mail.className='detail-line';mail.textContent='メール：'+identity.email;detail.appendChild(mail);
    if(joinedPart){const joined=document.createElement('div');joined.className='detail-line';joined.textContent=joinedPart;detail.appendChild(joined);}
    if(removeBtn){detail.appendChild(removeBtn);}

    toggle.addEventListener('click',()=>{
      const open=row.classList.toggle('open');
      toggle.textContent=open?'閉じる':'詳細';
      toggle.setAttribute('aria-expanded',open?'true':'false');
    });
    row.prepend(head);
    row.appendChild(detail);
    row.classList.add('staff-compact');
  }
  function apply(){
    addStyle();
    document.querySelectorAll('#staffList .staff-row').forEach(compactRow);
  }
  function boot(){
    const list=document.getElementById('staffList');
    if(!list){setTimeout(boot,150);return;}
    apply();
    const mo=new MutationObserver(()=>requestAnimationFrame(apply));
    mo.observe(list,{childList:true,subtree:false});
  }
  boot();
})();

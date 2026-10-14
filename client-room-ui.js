(()=>{
  const URL='https://pagamoaxhqszojxrpxyu.supabase.co';
  const KEY='sb_publishable_GQFRQYCo2oACYAh9lj9ZyA_JqfIPJGT';
  let rows=[];
  let byId=new Map();
  let byCode=new Map();
  let patchedLabel=false;
  let observer=null;
  let scheduled=false;

  function activeOrgId(){
    try{return localStorage.getItem('activeOrganizationId')||''}catch(_e){return ''}
  }
  function labelFor(row){
    if(!row)return '';
    const room=String(row.room_number||'').trim();
    const name=String(row.display_name||'').trim();
    const head=room||String(row.code||'').trim();
    return [head,name].filter(Boolean).join(' ');
  }
  function rowFor(value){return byId.get(String(value||''))||byCode.get(String(value||''))||null}
  function patchClientLabel(){
    if(patchedLabel)return;
    const current=window.clientLabel;
    if(typeof current!=='function')return;
    const wrapped=function(c){
      const row=rowFor(c?.id)||rowFor(c?.code);
      return row?labelFor(row):current(c);
    };
    wrapped.__roomAware=true;
    window.clientLabel=wrapped;
    patchedLabel=true;
  }
  function patchOptions(){
    document.querySelectorAll('option').forEach(opt=>{
      const row=rowFor(opt.value);
      if(row)opt.textContent=labelFor(row);
    });
  }
  function patchTextNodes(){
    if(!document.body)return;
    const replacements=rows
      .filter(r=>String(r.room_number||'').trim()&&String(r.code||'').trim()&&String(r.room_number).trim()!==String(r.code).trim())
      .map(r=>[String(r.code),String(r.room_number).trim()])
      .sort((a,b)=>b[0].length-a[0].length);
    if(!replacements.length)return;
    const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT,{acceptNode(node){
      const p=node.parentElement;if(!p)return NodeFilter.FILTER_REJECT;
      if(['SCRIPT','STYLE','TEXTAREA','NOSCRIPT'].includes(p.tagName))return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }});
    const nodes=[];let n;while((n=walker.nextNode()))nodes.push(n);
    nodes.forEach(node=>{
      let text=node.nodeValue||'',next=text;
      for(const [code,room] of replacements)if(next.includes(code))next=next.split(code).join(room);
      if(next!==text)node.nodeValue=next;
    });
  }
  function retireLegacyResidentEditors(){
    const card=document.getElementById('clientAdminCard');
    if(card)card.style.display='none';

    const old=document.getElementById('newClientCode');
    if(old){
      const add=old.closest('.client-manage-add');
      if(add&&!add.querySelector('.room-manage-link')){
        add.innerHTML='<a class="btn secondary room-manage-link" href="../manage/" style="text-decoration:none;display:inline-block">利用者の入退居は事業所管理で行う</a>';
      }
      const st=document.getElementById('clientManageStatus');if(st)st.textContent='部屋番号と利用者本人を分けて管理するため、追加・退去は事業所管理から行ってください。';
      const list=document.getElementById('clientManageList');
      if(list&&!list.querySelector('.room-manage-link'))list.innerHTML='<div class="small" style="padding:12px"><a class="room-manage-link" href="../manage/">事業所管理で利用者を確認する</a></div>';
    }
  }
  function apply(){
    scheduled=false;
    patchClientLabel();
    patchOptions();
    patchTextNodes();
    retireLegacyResidentEditors();
  }
  function schedule(){
    if(scheduled)return;scheduled=true;setTimeout(apply,60);
  }
  async function load(){
    if(!window.supabase)return false;
    const org=activeOrgId();if(!org)return false;
    const db=window.supabase.createClient(URL,KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
    const {data,error}=await db.from('clients').select('id,code,room_number,display_name,is_active').eq('organization_id',org);
    if(error){console.warn('room label lookup skipped',error.message);return false}
    rows=data||[];byId=new Map(rows.map(x=>[String(x.id),x]));byCode=new Map(rows.map(x=>[String(x.code),x]));
    apply();
    if(!observer){observer=new MutationObserver(schedule);observer.observe(document.documentElement,{childList:true,subtree:true,characterData:true});}
    return true;
  }
  let tries=0;
  const timer=setInterval(async()=>{
    tries++;
    try{if(await load()){clearInterval(timer);setTimeout(apply,800);setTimeout(apply,2000)}}catch(e){console.warn(e)}
    if(tries>=40)clearInterval(timer);
  },250);
})();

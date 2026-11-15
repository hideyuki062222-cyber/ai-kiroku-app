const fs=require('fs');
for(const file of ['index.html','dashboard/index.html','admin/index.html','staff/index.html','manage/index.html','handoff/index.html']){
  const html=fs.readFileSync(file,'utf8');
  const scripts=[...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).filter(Boolean);
  if(!scripts.length){
    const path=require('path');
    const local=[...html.matchAll(/<script[^>]*src="([^"?]+)[^"]*"/gi)].map(m=>m[1]).filter(src=>!src.startsWith('http'));
    if(!local.length)throw new Error(`${file}: script が見つかりません`);
    local.forEach(src=>new Function(fs.readFileSync(path.resolve(path.dirname(file),src),'utf8')));
  }
  scripts.forEach((code,i)=>{try{new Function(code)}catch(e){throw new Error(`${file} inline script #${i+1}: ${e.message}`)}});
}
console.log('html inline syntax: OK');

const fs=require('fs');
for(const file of ['manage/index.html','handoff/index.html']){
  const html=fs.readFileSync(file,'utf8');
  const scripts=[...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).filter(Boolean);
  if(!scripts.length)throw new Error(`${file}: inline script が見つかりません`);
  scripts.forEach((code,i)=>{try{new Function(code)}catch(e){throw new Error(`${file} inline script #${i+1}: ${e.message}`)}});
}
console.log('html inline syntax: OK');

const fs=require('fs');
const must=['今日','担当割当','申し送り','AI記録','出勤簿','出納帳','食事管理'];
const nav=fs.readFileSync('common-nav.js','utf8');
for(const label of must){if(!nav.includes(label))throw new Error(`共通ナビに ${label} がありません`)}
const mainPages=['index.html','dashboard/index.html','assignment/index.html','attendance/index.html','cashbook/index.html','meals/index.html','staff/index.html'];
for(const file of mainPages){const s=fs.readFileSync(file,'utf8');if(!s.includes('common-nav.js'))throw new Error(`${file}: common-nav.js がありません`)}
const handoff=fs.readFileSync('handoff/index.html','utf8');if(!handoff.includes('common-nav.js'))throw new Error('handoff/index.html: common-nav.js がありません');
if(!fs.existsSync('common-theme.css'))throw new Error('common-theme.css がありません');
console.log('navigation consistency: OK');

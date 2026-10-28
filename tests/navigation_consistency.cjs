const fs=require('fs');
const read=p=>fs.readFileSync(p,'utf8');
const labels=['今日','担当割当','申し送り','AI記録','出勤簿','出納帳','食事管理'];
const nav=read('common-nav.js');
for(const label of labels){if(!nav.includes(label))throw new Error(`共通ナビに「${label}」がありません`)}
if(!nav.includes('common-theme.css'))throw new Error('共通ナビが common-theme.css を読み込んでいません');
const pages=['index.html','dashboard/index.html','assignment/index.html','attendance/index.html','cashbook/index.html','handoff/index.html','meals/index.html','staff/index.html','manage/index.html'];
for(const file of pages){const s=read(file);if(!s.includes('common-nav.js'))throw new Error(`${file}: common-nav.js がありません`)}
for(const file of ['handoff/index.html','manage/index.html']){
  const s=read(file);
  if(!s.includes('common-nav.js'))throw new Error(`${file}: 独自ナビのままです`);
}
if(!fs.existsSync('common-theme.css'))throw new Error('common-theme.css がありません');
console.log('navigation consistency: OK');

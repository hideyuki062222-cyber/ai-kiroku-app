const assert=require('node:assert/strict'),C=require('../record-facts-core.js');let n=0;const eq=(a,b,m)=>{assert.deepEqual(a,b,m);n++};
const base={version:1,date:'2026-11-18',scene:'椅子・座椅子に座っていた',condition:'落ち着いて過ごされていた',health:'',statement:'',difference:'',concern:'',actions:[{service:'食事介助',actions:['食事中の見守りを行った'],note:'',self:'食具を操作した'}],supportNote:'',response:'うなずいて応じた',after:'椅子に座って過ごした'};
const a=C.compose(base,{usual:'普段は笑顔',communication:'声かけする',caution:'転倒注意',supportMethod:'洗身する'});eq(a.errors,[]);eq(a.care.startsWith(C.INTRO),true);eq(a.care.includes('洗身'),false);eq(a.visit.includes('笑顔'),false);eq(a.care.includes('転倒'),false);eq(a.care.includes('食具の操作は本人'),true);
const b=C.compose({...base,health:'痛みの訴えがあった',statement:'右膝が痛い',response:'介助を断る意思を示した'});eq(b.visit.includes('痛みの訴えがありました。'),true);eq(b.visit.includes('右膝が痛い'),true);eq(b.care.includes('断る意思'),true);eq(b.care===a.care,false);eq(b.visit===a.visit,false);
eq(C.compose(base,{}),C.compose(base,{usual:'別の利用者の普段の姿',supportMethod:'歩行介助'}),'different background never invents same-day acts');
eq(C.compose({...base,date:'2026-11-19'}).care,a.care,'date alone never creates artificial text differences');eq(C.compose(base),C.compose(base),'same facts stable');
const self=C.compose({...base,actions:[{service:'更衣介助',actions:['衣類を着る動作を介助した'],self:'衣類を脱いだ',note:''}]});eq(self.care.includes('衣類を脱ぐ動作は本人'),true);eq(self.care.includes('食具'),false);
const missing=C.compose({...base,scene:'',condition:'',actions:[{service:'食事介助',actions:[],self:'',note:''}],response:'',after:''});eq(missing.errors.length,2);eq(missing.visit,'');eq(missing.care,'');
for(const date of ['','2026-02-30','2026-99-99','1999-12-31','2101-01-01'])eq(C.validate({...base,date}).length>0,true);
const candidate=C.compose({...base,actions:[{service:'入浴介助',actions:[],note:'',self:''}],supportNote:'洗濯物を畳んだ'});eq(candidate.care.includes('洗身'),false);eq(candidate.care.includes('入浴'),false);eq(candidate.care.includes('洗濯物を畳んだ'),true);
eq(C.compose({...base,actions:[{service:'食事介助',actions:['未登録の選択値']}]}).errors.length>0,true);
const long='確認した動作についての具体的な内容。'.repeat(100);eq(C.compose({...base,supportNote:long}).care.includes(long),true,'important long facts never truncated');
for(const response of ['',...['うなずいて応じた','自分の希望を伝えた']]){const r=C.compose({...base,response});eq(r.care.includes('支援中、'),!!response);}
eq(C.compose({...base,scene:'その他',concern:'玄関先で出迎えた'}).visit.includes('玄関先で出迎えた'),true);eq(C.compose({...base,scene:'その他',concern:'玄関先で出迎えた'}).visit.includes('その他'),false);eq(C.compose({...base,scene:'その他',concern:''}).errors.length>0,true);
console.log('PASS factual record core:',n,'assertions / nine requested comparison cases');

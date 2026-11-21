const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),C=require('../record-facts-core.js'),S=require('../record-similarity.js'),{cases}=require('./fixtures/record_seven_days.cjs'),before=require('./fixtures/record_seven_days_before.json');
let checks=0;const ok=(v,m)=>{assert(v,m);checks++;},eq=(a,b,m)=>{assert.deepEqual(a,b,m);checks++;};
const groups=new Map(),results=[];
function operations(f,old=false){
 const a=f.actions[0],preset=C.quickChoices[a.service].find(p=>p.actions.length===a.actions.length&&p.actions.every(v=>a.actions.includes(v))&&!!p.unconfirmed===!!a.unconfirmed&&(old?!p.self:(p.self||'')===(a.self||'')));
 let detail=!preset||(old&&!!a.self)||!!a.after,steps=6+1+(preset?1:a.actions.length)+(detail?1:0)+(a.self&&(!preset||old)?2:0)+(a.reactions||[]).length+(a.after?2:0);
 if(old&&a.service==='食事介助'&&a.reactions.includes('声かけにうなずいて応じた'))steps+=2; // General response: open + select, instead of the service checkbox.
 return steps;
}
for(const t of cases){
 const prior=before.cases.find(c=>c.id===t.id).result,out=C.compose(t.facts);eq(prior.errors,[],t.id+' baseline valid');eq(out.errors,[],t.id+' valid');ok(out.care.startsWith(C.INTRO));
 const profile={data:{usual:{note:'いつも笑顔'},support:{note:'洗身の全介助'}}};eq(out,C.compose(t.facts,profile),t.id+' background never becomes an event');
 const a=t.facts.actions[0];for(const action of a.actions){const term=action==='服薬の声かけを行った'?(out.care.includes('声をかけ')?'声をかけ':'声かけを行'):action==='服薬したことを確認した'?'薬を服用されたことを確認':action.split(/を|に付き添/)[0];ok(out.care.includes(term),t.id+' action retained: '+action);}
 if(t.service==='服薬介助・確認'&&!a.actions.includes('服薬したことを確認した'))ok(!out.care.includes('服用されたことを確認'),t.id+' unconfirmed dose');
 for(const invented of ['副作用','薬剤名','嚥下','血圧','医師に連絡','発熱はありません'])ok(!(out.visit+out.care).includes(invented),t.id+' no invented '+invented);
 const priorRows=groups.get(t.service)||[],matches=S.compare({organizationId:'a',clientId:'one',visitNote:out.visit,careNote:out.care},priorRows);
 if(t.day===2||t.day===7)ok(matches.some(r=>r.kind==='exact'),t.id+' repeated facts detected');
 priorRows.push({id:t.id,organization_id:'a',client_id:'one',service_date:t.facts.date,visit_note:out.visit,care_note:out.care});groups.set(t.service,priorRows);
 results.push({...t,before:prior,after:out,matchCount:matches.length,operations:{beforeGenerate:operations(t.facts,true),afterGenerate:operations(t.facts),save:1,additionalSimilarityOperations:0}});
}
for(const [service,rows] of groups){
 eq(rows[0].visit_note,rows[1].visit_note);eq(rows[0].care_note,rows[1].care_note);eq(rows[2].visit_note,rows[6].visit_note);eq(rows[2].care_note,rows[6].care_note);
 ok(rows[2].care_note!==rows[3].care_note,service+' different methods/responses retained');
 const seed=cases.find(t=>t.service===service).facts,seven=Array.from({length:7},(_,i)=>C.compose({...seed,date:'2026-11-'+String(9+i).padStart(2,'0')}));for(const out of seven)eq(out,seven[0],service+' date alone creates no fictional change');
}
for(const [service,choices] of Object.entries(C.quickChoices))for(const p of choices.filter(p=>p.self)){const r=C.compose({...cases[0].facts,actions:[{service,confirmedService:true,actions:p.actions,self:p.self}]});eq(r.errors,[]);ok(r.care.includes('本人'));ok(r.care.includes('職員は'));}
const output=process.env.RECORD_DAILY_REPORT;
if(output){
 const lines=['# PR #29 追加修正：架空データによる7日分の比較','','比較元：`'+before.commit+'`。各サービスとも同じ架空利用者Aへ7日間支援した想定です。実在者・本番データは使用していません。','','両版に同じ確認済み事実を与えて比較しています。食事5日目のうなずきは旧版の全体反応欄に入力し、同じ事実に揃えました。同じ事実なら文章が同じになるのは意図した動作です。今回の改善は任意の具体化ショートカットと、追加操作のない類似表示です。事実を増やさずに文量だけを増やしません。','','全例の支援文には「'+C.INTRO+'」が付きます。下表では読みやすさのため、この共通冒頭だけ省略しています。','','操作は利用者選択から生成まで。選択欄は開く＋選ぶを2操作、チェック・任意欄を開く・生成は各1操作。スクロール・入力時間・ログインを含まない机上モデルで、実機測定ではありません。日付は各当日に自動設定される想定です。正式保存は両版とも＋1操作。類似表示による追加クリックは0です。'];
 for(const service of groups.keys()){
  lines.push('','## '+service,'','| 日 | 改善前の文章（同じ事実） | 改善後の文章 | 生成までの操作：前→後 | 過去との一致・類似 |','|---|---|---|---:|---|');
  for(const r of results.filter(r=>r.service===service)){const fmt=x=>('① '+x.visit+'<br>② '+x.care.replace(C.INTRO,'')).replaceAll('\n','<br>').replaceAll('|','／');lines.push(`| ${r.day}日目 | ${fmt(r.before)} | ${fmt(r.after)} | ${r.operations.beforeGenerate}→${r.operations.afterGenerate} | ${r.matchCount?String(r.matchCount)+'件を表示':'該当なし'} |`);}
 }
 lines.push('','## 結果','','2日目は1日目、7日目は3日目と同じ事実にし、文章の一致を検出しました。異なる状態・介助方法・本人の反応はそのまま文章へ反映しています。同じ事実を7日間続ける追加検証でも、架空の変化やランダムな表現変更はありません。','','通常の最小入力は前後とも生成6操作＋正式保存1操作です。任意の詳細を入力した例と最小入力を混ぜて比較していません。入浴・排泄・食事などの自立部分を含む例は、既存の詳細欄で複数回選ぶ代わりに、事実が明記されたショートカットを1回選べます。','','類似判定は文字列の2文字連続ペアによる参考判定です。内容の正確性・支援の妥当性・運営指導への適合を保証するものではありません。職員による事実確認は必要です。閲覧可能な同一施設・同一利用者の直近300件と最新の訂正履歴を比較し、無関係な記録やプロフィールは参照しません。生成時点の比較であり、その後に別端末で保存された記録は次の生成時に反映します。');
 fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,lines.join('\n')+'\n');fs.writeFileSync(path.join(path.dirname(output),'seven-days.json'),JSON.stringify({passed:true,checks,results},null,2));
}
console.log('PASS seven-day comparison:',checks,'checks; four services x seven days, identical/changed facts, no invented variations, optional shortcut operations');

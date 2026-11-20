/* Deterministic composition of confirmed observations. No network or profile-to-event inference. */
(function(root){
 'use strict';
 const INTRO='指示内容確認しました。前回のサービス記録確認しました。';
 const serviceActions={
  '食事介助':['食事中の見守りを行った','食事の際に声をかけた','食物を口元へ運ぶ介助を行った'],
  'トイレ介助':['トイレへの移動を介助した','排泄時の衣類の上げ下げを介助した','排泄後の清拭を介助した','排泄中の見守りを行った'],
  '入浴介助':['洗身を介助した','洗髪を介助した','浴槽の出入りを介助した','入浴中の見守りを行った'],
  '入浴準備':['入浴用の物品を準備した','浴室の環境を整えた'],
  '更衣介助':['衣類を準備した','衣類を着る動作を介助した','衣類を脱ぐ動作を介助した','更衣中の見守りを行った'],
  '服薬介助・確認':['服薬の声かけを行った','服薬の準備を介助した','服薬したことを確認した'],
  '口腔ケア':['歯磨きの声かけを行った','歯磨きを介助した','口腔ケア中の見守りを行った'],
  '起床介助':['起き上がりを介助した','起床の声かけを行った'],
  '就寝介助':['寝具を整えた','ベッドへの移乗を介助した','就寝準備の声かけを行った'],
  '清容・保清':['洗顔を介助した','整髪を介助した','清拭を行った'],
  '移動介助':['歩行に付き添った','車椅子での移動を介助した','移乗を介助した'],
  '買い物・外出支援':['買い物に付き添った','商品選びの声かけを行った'],
  '通院等介助':['通院に付き添った','受診の手続きを支援した'],
  '家事援助':['掃除を行った','洗濯を行った','調理を行った'],
  'その他':[]
 };
 const profileFields={
  usual:['普段の体調・様子',['穏やかに過ごすことが多い','疲れやすい','日によって変動がある']],
  communication:['コミュニケーション方法',['短い言葉で伝える','ゆっくり話す','写真・絵で伝える','筆談する']],
  expression:['意思表示の方法',['言葉で伝える','うなずき・首振り','表情・身振り','指差し']],
  independent:['本人ができること',['食具の操作','衣類の着脱の一部','歩行','意思の選択']],
  assistance:['介助が必要なこと',['移動','排泄','食事','入浴','更衣']],
  mobility:['移動・排泄の支援方法',['歩行時の見守り','移乗の介助','衣類の調整']],
  personalCare:['食事・入浴などの支援方法',['本人のペースを待つ','一つずつ手順を伝える','部分的に介助']],
  traits:['障害特性・本人の特性',['予定変更に不安がある','感覚への配慮が必要','慣れた手順を好む']],
  cautions:['注意事項',[]], support:['基本的な支援方法',[]],other:['その他の個別情報',[]]
 };
 const text=v=>typeof v==='string'?v.trim():'';
 const sentence=v=>{const s=text(v);return s?(/[。！？]$/.test(s)?s:s+'。'):'';};
 function validate(f){
  const errors=[];
  let validDate=false;try{validDate=/^\d{4}-\d{2}-\d{2}$/.test(f.date||'')&&f.date>='2000-01-01'&&f.date<='2100-12-31'&&new Date(f.date+'T00:00:00Z').toISOString().slice(0,10)===f.date;}catch{}if(!validDate)errors.push('記録日を確認してください。');
  if(![f.scene,f.condition,f.health,f.statement,f.difference,f.concern].some(text))errors.push('① 訪問時に確認した状態・表情・体調などを1つ選択、または入力してください。');
  if([f.scene,f.condition,f.health].some(v=>v==='その他')&&![f.statement,f.concern].some(text))errors.push('①「その他」の具体的な内容を発言・気づき欄へ入力してください。');
  const performed=(f.actions||[]).filter(a=>(a.actions||[]).length||text(a.note));
  if(!performed.length&&!text(f.supportNote))errors.push('② 当日実施した支援を1つ選択、または補足に具体的に入力してください。担当からの選択だけでは実施済みにしません。');
  for(const a of f.actions||[])for(const v of a.actions||[])if(!serviceActions[a.service]?.includes(v))errors.push('② 支援の選択内容を確認してください。');
  return errors;
 }
 function compose(f,_profile){
  const errors=validate(f);if(errors.length)return {errors,visit:'',care:''};
  const visit=[f.scene&&f.scene!=='その他'?('訪問時、'+text(f.scene)):null,f.condition==='その他'?'':f.condition,f.health==='その他'?'':f.health,f.statement?('本人の発言・訴え：'+text(f.statement)):null,f.difference?('普段との違い：'+text(f.difference)):null,f.concern?('気になった点：'+text(f.concern)):null].filter(Boolean).map(sentence).join('');
  const care=[INTRO];
  for(const a of f.actions||[]){
   // Candidates from assignment presets never imply performed actions.
   for(const v of a.actions||[])care.push(sentence(v));
   if(text(a.note))care.push(sentence(a.note));
   if(text(a.self))care.push(sentence('本人が自分で行ったこと：'+text(a.self)));
  }
  if(text(f.supportNote))care.push(sentence(f.supportNote));
  if(text(f.response))care.push(sentence('支援中の本人の反応：'+text(f.response)));
  if(text(f.after))care.push(sentence('支援後の状態：'+text(f.after)));
  return {errors:[],visit,care:care.join('')};
 }
 const api={INTRO,serviceActions,profileFields,validate,compose,sentence};if(typeof module!=='undefined')module.exports=api;else root.NexiaFactCore=api;
})(globalThis);

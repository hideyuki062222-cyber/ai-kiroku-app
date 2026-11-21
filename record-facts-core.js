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
  'その他':['本人の見守りを行った','本人に声をかけた']
 };
 const supportExtras={
 "食事介助": {
  "actions": [
   "食器の位置を整える介助を行った",
   "食物を食べやすい大きさにする介助を行った"
  ],
  "reactions": [
   [
    "食べる量の希望を伝えた",
    "本人から食べる量の希望が伝えられました"
   ],
   [
    "食事中に休憩を希望した",
    "本人から食事中に休憩したいとの希望がありました"
   ]
  ],
  "after": [
   [
    "食事支援後に飲み物を希望した",
    "食事の支援後、本人から飲み物を希望する発言がありました"
   ],
   [
    "食事支援後に満腹と伝えた",
    "食事の支援後、本人から満腹との発言がありました"
   ]
  ]
 },
 "トイレ介助": {
  "actions": [
   "トイレの扉の開閉を介助した",
   "排泄後の手洗いを介助した"
  ],
  "reactions": [
   [
    "衣類の調整を依頼した",
    "本人から衣類の調整の依頼がありました"
   ],
   [
    "排泄中に支えてほしいと伝えた",
    "排泄中、本人から支えてほしいとの希望がありました"
   ]
  ],
  "after": [
   [
    "排泄支援後に居室へ戻る希望を伝えた",
    "排泄の支援後、本人から居室へ戻りたいとの希望がありました"
   ],
   [
    "排泄支援後に休憩を希望した",
    "排泄の支援後、本人から休憩したいとの希望がありました"
   ]
  ]
 },
 "入浴介助": {
  "actions": [
   "洗身後の体を拭く介助を行った",
   "シャワーを持つ動作を介助した"
  ],
  "reactions": [
   [
    "湯の温度の希望を伝えた",
    "本人から湯の温度の希望が伝えられました"
   ],
   [
    "洗う場所を自分で伝えた",
    "本人が洗う場所を自分で伝えられました"
   ]
  ],
  "after": [
   [
    "入浴支援後に水分を希望した",
    "入浴の支援後、本人から水分を希望する発言がありました"
   ],
   [
    "入浴支援後に休憩を希望した",
    "入浴の支援後、本人から休憩したいとの希望がありました"
   ]
  ]
 },
 "入浴準備": {
  "actions": [
   "着替えを手元に置く支援を行った",
   "入浴用のタオルを準備した"
  ],
  "reactions": [
   [
    "使用するタオルを自分で選んだ",
    "本人が使用するタオルを自分で選ばれました"
   ],
   [
    "準備する物品の希望を伝えた",
    "本人から準備する物品の希望が伝えられました"
   ]
  ],
  "after": [
   [
    "入浴準備後に浴室へ向かう希望を伝えた",
    "入浴の準備後、本人から浴室へ向かいたいとの希望がありました"
   ],
   [
    "入浴準備後に開始を待つと伝えた",
    "入浴の準備後、本人から開始を待つとの発言がありました"
   ]
  ]
 },
 "更衣介助": {
  "actions": [
   "衣類の向きを整える介助を行った",
   "袖に腕を通す介助を行った"
  ],
  "reactions": [
   [
    "着たい衣類を指差した",
    "本人が着たい衣類を指差されました"
   ],
   [
    "袖を通す際に腕を伸ばした",
    "袖を通す際、本人が腕を伸ばされました"
   ]
  ],
  "after": [
   [
    "更衣支援後に着心地の希望を伝えた",
    "更衣の支援後、本人から着心地についての希望が伝えられました"
   ],
   [
    "更衣支援後に衣類を自分で整えた",
    "更衣の支援後、本人が衣類を自分で整えられました"
   ]
  ]
 },
 "服薬介助・確認": {
  "actions": [
   "服薬に使う水を準備した",
   "薬を手元に置く介助を行った"
  ],
  "reactions": [
   [
    "薬を本人が受け取った",
    "本人が薬を受け取られました"
   ],
   [
    "服薬について質問した",
    "本人から服薬について質問がありました"
   ]
  ],
  "after": [
   [
    "服薬支援後に飲水を希望した",
    "服薬に関する支援後、本人から飲水を希望する発言がありました"
   ],
   [
    "服薬支援後に休む希望を伝えた",
    "服薬に関する支援後、本人から休みたいとの希望がありました"
   ]
  ]
 },
 "口腔ケア": {
  "actions": [
   "歯ブラシに歯磨き剤を付ける介助を行った",
   "義歯を洗う介助を行った"
  ],
  "reactions": [
   [
    "うがい用の水を希望した",
    "本人からうがい用の水を希望する発言がありました"
   ],
   [
    "磨く場所を本人が伝えた",
    "本人が磨く場所を伝えられました"
   ]
  ],
  "after": [
   [
    "口腔ケア後に自分で用具を片付けた",
    "口腔ケア後、本人が自分で用具を片付けられました"
   ],
   [
    "口腔ケア後に口元を自分で拭いた",
    "口腔ケア後、本人が口元を自分で拭かれました"
   ]
  ]
 },
 "起床介助": {
  "actions": [
   "掛け物を外す介助を行った",
   "起床時の履物を準備した"
  ],
  "reactions": [
   [
    "もう少し休みたいと伝えた",
    "本人からもう少し休みたいとの希望がありました"
   ],
   [
    "起きる準備ができたと伝えた",
    "本人から起きる準備ができたとの発言がありました"
   ]
  ],
  "after": [
   [
    "起床支援後に座って過ごす希望を伝えた",
    "起床の支援後、本人から座って過ごしたいとの希望がありました"
   ],
   [
    "起床支援後に洗顔を希望した",
    "起床の支援後、本人から洗顔を希望する発言がありました"
   ]
  ]
 },
 "就寝介助": {
  "actions": [
   "枕の位置を整える介助を行った",
   "掛け物を掛ける介助を行った"
  ],
  "reactions": [
   [
    "掛け物の希望を伝えた",
    "本人から掛け物の希望が伝えられました"
   ],
   [
    "照明について希望を伝えた",
    "本人から照明についての希望が伝えられました"
   ]
  ],
  "after": [
   [
    "就寝支援後に横になって休んだ",
    "就寝の支援後、本人は横になって休まれました"
   ],
   [
    "就寝支援後に照明を消す希望を伝えた",
    "就寝の支援後、本人から照明を消してほしいとの希望がありました"
   ]
  ]
 },
 "清容・保清": {
  "actions": [
   "タオルを手元へ渡す支援を行った",
   "爪の手入れを介助した"
  ],
  "reactions": [
   [
    "拭く場所を本人が伝えた",
    "本人が拭く場所を伝えられました"
   ],
   [
    "整えたい髪型を伝えた",
    "本人から整えたい髪型の希望が伝えられました"
   ]
  ],
  "after": [
   [
    "清容支援後に鏡で確認した",
    "清容・保清の支援後、本人が鏡で確認されました"
   ],
   [
    "清容支援後に自分でタオルを片付けた",
    "清容・保清の支援後、本人が自分でタオルを片付けられました"
   ]
  ]
 },
 "移動介助": {
  "actions": [
   "歩行器を使う移動に付き添った",
   "段差を越える動作を介助した"
  ],
  "reactions": [
   [
    "移動中に休憩を希望した",
    "移動中、本人から休憩したいとの希望がありました"
   ],
   [
    "進む方向を指差した",
    "本人が進む方向を指差されました"
   ]
  ],
  "after": [
   [
    "移動支援後に目的の場所に着いたと伝えた",
    "移動の支援後、本人から目的の場所に着いたとの発言がありました"
   ],
   [
    "移動支援後に座って休む希望を伝えた",
    "移動の支援後、本人から座って休みたいとの希望がありました"
   ]
  ]
 },
 "買い物・外出支援": {
  "actions": [
   "商品をかごに入れる介助を行った",
   "支払いの手続きを支援した"
  ],
  "reactions": [
   [
    "購入する品物の希望を伝えた",
    "本人から購入する品物の希望が伝えられました"
   ],
   [
    "外出中に休憩を希望した",
    "外出中、本人から休憩したいとの希望がありました"
   ]
  ],
  "after": [
   [
    "外出支援後に購入品を自分で確認した",
    "買い物・外出の支援後、本人が購入品を自分で確認されました"
   ],
   [
    "外出支援後に帰宅する希望を伝えた",
    "買い物・外出の支援後、本人から帰宅したいとの希望がありました"
   ]
  ]
 },
 "通院等介助": {
  "actions": [
   "受付での手続きを支援した",
   "会計の手続きを支援した"
  ],
  "reactions": [
   [
    "医師に尋ねたい内容を伝えた",
    "本人から医師に尋ねたい内容が伝えられました"
   ],
   [
    "待合室で休憩を希望した",
    "待合室で、本人から休憩したいとの希望がありました"
   ]
  ],
  "after": [
   [
    "通院支援後に次の予定について質問した",
    "通院等の支援後、本人から次の予定について質問がありました"
   ],
   [
    "通院支援後に帰宅する希望を伝えた",
    "通院等の支援後、本人から帰宅したいとの希望がありました"
   ]
  ]
 },
 "家事援助": {
  "actions": [
   "食器を洗う支援を行った",
   "ごみをまとめる支援を行った"
  ],
  "reactions": [
   [
    "掃除する場所の希望を伝えた",
    "本人から掃除する場所の希望が伝えられました"
   ],
   [
    "物を置く位置を本人が伝えた",
    "本人が物を置く位置を伝えられました"
   ]
  ],
  "after": [
   [
    "家事支援後に片付いた場所を確認した",
    "家事の支援後、本人が片付いた場所を確認されました"
   ],
   [
    "家事支援後に自分で物を並べた",
    "家事の支援後、本人が自分で物を並べられました"
   ]
  ]
 },
 "その他": {
  "actions": [
   "本人が選ぶための物品を並べる支援を行った",
   "本人の依頼で物品を手元へ渡した"
  ],
  "reactions": [
   [
    "希望する物品を指差した",
    "本人が希望する物品を指差されました"
   ],
   [
    "説明をもう一度希望した",
    "本人から説明をもう一度聞きたいとの希望がありました"
   ]
  ],
  "after": [
   [
    "支援後に次の希望を本人が伝えた",
    "支援後、本人から次の希望が伝えられました"
   ],
   [
    "支援後に自分で物品を使い始めた",
    "支援後、本人が自分で物品を使い始められました"
   ]
  ]
 }
};
 for(const [service,extra] of Object.entries(supportExtras))serviceActions[service].push(...extra.actions);
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
 const unique=xs=>[...new Set(xs.filter(Boolean))];
 // Every preset names all of its included facts. Nothing is checked by default.
 serviceActions['入浴介助'].push('下肢の洗身を介助した','背部の洗身を介助した');
 const detailedActions={
  'トイレ介助':['パッドの交換を介助した','便座への移乗を介助した'],
  '食事介助':['食具の操作を介助した','食事姿勢を整える介助を行った'],
  '口腔ケア':['口をすすぐ動作を介助した'],'更衣介助':['衣類の留め具を扱う動作を介助した'],
  '起床介助':['端座位になる動作を介助した'],'就寝介助':['就寝前の物品を準備した'],
  '清容・保清':['手洗いを介助した'],'移動介助':['立ち上がる動作を介助した'],
  '通院等介助':['診察室への移動に付き添った']
 };
 for(const [service,actions] of Object.entries(detailedActions))serviceActions[service].push(...actions);
 const presets={
  '服薬介助・確認':[['声かけ＋服用確認',[0,2]],['準備の介助＋服用確認',[1,2]],['声かけのみ（服用未確認）',[0]],['準備の介助のみ（服用未確認）',[1]]],
  '食事介助':[['食事中の見守り',[0]],['声かけ＋見守り',[1,0]],['口元へ運ぶ介助',[2]]],
  'トイレ介助':[['トイレへの移動介助',[0]],['衣類の上げ下げ介助',[1]],['排泄中の見守り',[3]]],
  '入浴介助':[['洗身の介助',[0]],['洗髪の介助',[1]],['入浴中の見守り',[3]]],
  '入浴準備':[['物品の準備',[0]],['浴室の環境整備',[1]]],
  '更衣介助':[['着衣の介助',[1]],['脱衣の介助',[2]],['更衣中の見守り',[3]]],
  '口腔ケア':[['歯磨きの声かけ',[0]],['歯磨きの介助',[1]],['口腔ケア中の見守り',[2]]],
  '起床介助':[['起き上がりの介助',[0]],['起床の声かけ',[1]]],
  '就寝介助':[['寝具を整えた',[0]],['ベッドへの移乗介助',[1]],['就寝準備の声かけ',[2]]],
  '清容・保清':[['洗顔の介助',[0]],['整髪の介助',[1]],['清拭',[2]]],
  '移動介助':[['歩行の付き添い',[0]],['車椅子での移動介助',[1]],['移乗の介助',[2]]],
  '買い物・外出支援':[['買い物の付き添い',[0]],['商品選びの声かけ',[1]]],
  '通院等介助':[['通院の付き添い',[0]],['受診手続きの支援',[1]]],
  '家事援助':[['掃除',[0]],['洗濯',[1]],['調理',[2]]], 'その他':[['見守り',[0]],['声かけ',[1]]]
 };
 const quickChoices=Object.fromEntries(Object.entries(presets).map(([s,ps])=>[s,ps.map(([label,indices],i)=>({id:s+'-'+i,label,actions:indices.map(n=>serviceActions[s][n]),unconfirmed:s==='服薬介助・確認'&&i>=2}))]));
 // Optional shortcuts explicitly state the person's own action and the worker's help.
 for(const [service,label,actions,self] of [
  ['入浴介助','上半身は本人・背部の洗身を介助',['背部の洗身を介助した'],'上半身を洗った'],
  ['トイレ介助','衣類は本人が下げた・職員は見守り',['排泄中の見守りを行った'],'衣類を下げた'],
  ['食事介助','本人が口元へ運んだ・職員は見守り',['食事中の見守りを行った'],'食物を口元へ運んだ'],
  ['口腔ケア','歯磨きは本人・職員は見守り',['口腔ケア中の見守りを行った'],'歯を磨いた'],
  ['更衣介助','脱衣は本人・着衣を介助',['衣類を着る動作を介助した'],'衣類を脱いだ'],
  ['移動介助','立ち上がりは本人・歩行に付き添い',['歩行に付き添った'],'立ち上がった']
 ])quickChoices[service].push({id:service+'-self',label,actions,self});
 const reactions={
  '服薬介助・確認':['声かけにうなずいて応じた','本人が自分で服薬した','服薬を拒否した','服薬に時間を要した'],
  '食事介助':['自分で食具を操作した','食事を希望する発言があった','食事を断る意思を示した','食事に時間を要した','声かけにうなずいて応じた'],
  'トイレ介助':['排泄の希望を伝えた','声かけにうなずいて応じた','排泄時に痛みを訴えた','排泄に時間を要した'],
  '入浴介助':['入浴を希望した','声かけにうなずいて応じた','入浴を断る意思を示した','入浴中に疲れを訴えた'],
  '入浴準備':['入浴を希望した','自分で衣類を選んだ','声かけにうなずいて応じた'],
  '更衣介助':['自分で衣類を選んだ','声かけにうなずいて応じた','更衣を断る意思を示した'],
  '口腔ケア':['自分で歯ブラシを持った','声かけにうなずいて応じた','口腔ケアを断る意思を示した'],
  '起床介助':['起床の声かけに返事をした','眠気を訴えた','自分から起き上がった'],
  '就寝介助':['休みたいと伝えた','声かけにうなずいて応じた','就寝の声かけに返事をした'],
  '清容・保清':['自分でタオルを持った','声かけにうなずいて応じた','清拭を断る意思を示した'],
  '移動介助':['行き先の希望を伝えた','声かけにうなずいて応じた','移動中に疲れを訴えた','移動に時間を要した'],
  '買い物・外出支援':['自分で商品を選んだ','行き先の希望を伝えた','外出中に疲れを訴えた'],
  '通院等介助':['本人が医師へ症状を伝えた','声かけにうなずいて応じた','待ち時間に疲れを訴えた'],
  '家事援助':['片付けの希望を伝えた','自分で洗濯物を畳んだ','声かけにうなずいて応じた'],
  'その他':['声かけにうなずいて応じた','自分の希望を伝えた','介助を断る意思を示した']
 };
 for(const [service,extra] of Object.entries(supportExtras))reactions[service].push(...extra.reactions.map(([label])=>label));
 const selfChoices={
  '入浴介助':['上半身を洗った','髪を洗った','体を拭いた'],
  '更衣介助':['衣類を脱いだ','衣類を着た','衣類を選んだ'],
  'トイレ介助':['衣類を下げた','衣類を上げた','排泄後に手を洗った'],
  '口腔ケア':['歯を磨いた','口をすすいだ'],
  '移動介助':['立ち上がった','歩いて移動した'],
  '食事介助':['食具を操作した','食物を口元へ運んだ']
 };
 const afterChoices=['椅子に座って過ごした','ベッドで休んだ','自分で次の行動を始めた'];
 const medicationAfter=['服薬後に体調の訴えがあった','服薬後に特に変化がなかった'];
 const methodChoices=['短い言葉で声をかけた','ゆっくり話した','写真・絵を用いて伝えた','筆談で伝えた','本人のペースを待った','手順を一つずつ伝えた'];
 const afterFor=service=>unique([...afterChoices,...(service==='服薬介助・確認'?medicationAfter:[]),...(supportExtras[service]?.after||[]).map(([label])=>label)]);
 function suggestions(profile){
  const data=profile?.data||profile||{},comm=data.communication?.choices||[],care=data.personalCare?.choices||[];
  return unique([['短い言葉で伝える',0],['ゆっくり話す',1],['写真・絵で伝える',2],['筆談する',3]].filter(([v])=>comm.includes(v)).map(([,n])=>methodChoices[n]).concat(care.includes('本人のペースを待つ')?[methodChoices[4]]:[],care.includes('一つずつ手順を伝える')?[methodChoices[5]]:[]));
 }
 // An explicit service checkbox confirms only that service, never its usual steps.
 // Scheduled candidates and saved facts without this flag keep their former meaning.
 function performed(a){return a.confirmedService===true||(a.actions||[]).length||text(a.note)||(a.methods||[]).length;}
 function validate(f){
  const errors=[];let validDate=false;
  try{validDate=/^\d{4}-\d{2}-\d{2}$/.test(f.date||'')&&f.date>='2000-01-01'&&f.date<='2100-12-31'&&new Date(f.date+'T00:00:00Z').toISOString().slice(0,10)===f.date;}catch{}
  if(!validDate)errors.push('記録日を確認してください。');
  if(![f.scene,f.condition,f.health,f.statement,f.difference,f.concern].some(text))errors.push('① 訪問時に確認した状態・表情・体調などを1つ選択、または入力してください。');
  if([f.scene,f.condition,f.health].some(v=>v==='その他')&&![f.statement,f.concern].some(text))errors.push('①「その他」の具体的な内容を発言・気づき欄へ入力してください。');
  if(!Array.isArray(f.actions)){errors.push('② 当日実施した支援を確認してください。');return errors;}
  if(!f.actions.some(performed)&&!text(f.supportNote))errors.push('② 当日実施した支援を1つ選択、または補足に具体的に入力してください。担当からの候補だけでは実施済みにしません。');
  const seen=new Set();
  for(const a of f.actions){
   if(Object.hasOwn(a,'confirmedService')&&typeof a.confirmedService!=='boolean')errors.push('② 実施サービスの確認内容を確認してください。');
   if(!Object.hasOwn(serviceActions,a.service)||seen.has(a.service)){errors.push('② サービスの選択内容を確認してください。');continue;}seen.add(a.service);
   if(!Array.isArray(a.actions)||a.actions.some(v=>!serviceActions[a.service].includes(v))){errors.push('② 支援の選択内容を確認してください。');continue;}
   if(a.reactions&&(!Array.isArray(a.reactions)||a.reactions.some(v=>!reactions[a.service]?.includes(v))))errors.push('② 本人の反応の選択内容を確認してください。');
   if(a.methods&&(!Array.isArray(a.methods)||a.methods.some(v=>!methodChoices.includes(v))))errors.push('② 当日の支援方法を確認してください。');
   if(a.after&&!afterFor(a.service).includes(a.after))errors.push('② 支援後の状態を確認してください。');
   if(!performed(a)&&((a.reactions||[]).length||a.self||a.after))errors.push('② '+a.service+'：本人の反応に加えて、当日実施した支援を選択してください。');
   if(a.service==='服薬介助・確認'){
    const rs=a.reactions||[],confirmed=a.actions.includes('服薬したことを確認した')||rs.includes('本人が自分で服薬した');
    if((rs.includes('服薬を拒否した')&&confirmed)||(a.unconfirmed&&confirmed))errors.push('② 服薬の「確認済み」と「拒否・未確認」が重なっています。選択を確認し、途中の経過は補足にまとめてください。');
    if(a.after&&medicationAfter.includes(a.after)&&!confirmed)errors.push('② 服薬後の状態を記録するには、実際に服薬を確認した内容も選択してください。');
   }
  }
  if(f.lengthMode&&!['short','normal','long'].includes(f.lengthMode))errors.push('記録の長さを確認してください。');
  return unique(errors);
 }
 const polite=v=>{let s=text(v).replace(/^本人のペースを待った$/,'本人のペースに合わせて待った');
  for(const [pattern,replacement] of [[/行った$/,'行いました'],[/付き添った$/,'付き添いました'],[/声をかけた$/,'声をかけました'],[/整えた$/,'整えました'],[/した$/,'しました'],[/伝えた$/,'伝えました'],[/待った$/,'待ちました']])if(pattern.test(s))return s.replace(pattern,replacement);
  return s;
 };
 const connective=s=>{
  for(const [pattern,replacement] of [[/いたしました$/,'し'],[/確かめました$/,'確かめ'],[/いらっしゃいました$/,'いらっしゃり'],[/行いました$/,'行い'],[/付き添いました$/,'付き添い'],[/かけました$/,'かけ'],[/整えました$/,'整え'],[/伝えました$/,'伝え'],[/待ちました$/,'待ち'],[/おられました$/,'おられ'],[/ていました$/,'ており'],[/見られました$/,'見られ'],[/ありませんでした$/,'なく'],[/ありました$/,'あり'],[/していません$/,'しておらず'],[/しました$/,'し'],[/でした$/,'で'],[/れました$/,'れ']])if(pattern.test(s))return s.replace(pattern,replacement);
  return s;
 };
 function joinClauses(clauses,mode='normal'){
  const xs=unique(clauses);if(!xs.length)return '';
  if(mode==='long')return xs.map(sentence).join('');
  const out=[];for(let i=0;i<xs.length;i+=mode==='short'?3:2){const group=xs.slice(i,i+(mode==='short'?3:2));out.push(sentence(group.slice(0,-1).map(connective).join('、')+(group.length>1?'、':'')+group.at(-1)));}return out.join('');
 }
 const observations={
  'ベッド上で仰臥位で寝ていた':'ベッド上で仰臥位にて入眠されていました',
  'ベッド上で仰臥位で休んでいた':'ベッド上で仰臥位にて休まれていました',
  'ベッド上で側臥位で休んでいた':'ベッド上で側臥位にて休まれていました',
  'ベッド上で上体を起こしていた':'ベッド上で上体を起こして過ごされていました',
  'ベッド端に座っていた':'ベッド端に座っておられました',
  '座ってテレビを見ていた':'座った状態でテレビを見ておられました',
  'ベッド上でテレビを見ていた':'ベッド上でテレビを見ておられました',
  'スマートフォンを操作していた':'スマートフォンを操作されていました',
  '音楽を聴いて過ごしていた':'音楽を聴いて過ごされていました',
  '食事をしていた':'食事をされていました','飲み物を飲んでいた':'飲み物を飲んでおられました',
  '室内を歩いていた':'室内を歩いておられました','身の回りの物を整理していた':'身の回りの物を整理されていました',
  '横になって休んでいた':'横になって休まれていました','入眠していた':'入眠されていました',
  '起床直後だった':'起床直後でした','テレビをつけて静かに過ごしていた':'テレビをつけて静かに過ごされていました',
  '何もせずゆっくり過ごしていた':'ゆっくり過ごされていました','疲れた様子があった':'疲れた様子が見られました',
  '椅子・座椅子に座っていた':'椅子・座椅子に座っておられました','ベッドで休んでいた':'ベッドで休んでおられました',
  '落ち着いて過ごされていた':'落ち着いて過ごされていました','普段と変わりなく過ごされていた':'普段と変わりなく過ごされていました',
  '笑顔が見られた':'笑顔が見られました','眠そうな様子が見られた':'眠そうな様子が見られました','疲れた様子が見られた':'疲れた様子が見られました','不安そうな様子が見られた':'不安そうな様子が見られました',
  '会話が多く見られた':'会話が多く見られました','会話は少なめだった':'会話は少なめでした',
  '体調に変化なし':'体調に変化はありませんでした','体調良好':'体調は良好でした','疲労感の訴えなし':'疲労感の訴えはありませんでした',
  '痛みの訴えなし':'痛みの訴えはありませんでした','痛みの訴えがあった':'痛みの訴えがありました','発熱なし':'発熱はありませんでした',
  '食欲あり':'食欲がありました','食欲低下が見られた':'食欲の低下が見られました','睡眠不足の訴えがあった':'睡眠不足の訴えがありました','体調不良の訴えがあった':'体調不良の訴えがありました',
  '普段どおりだった':'普段どおりでした','普段より動作がゆっくりだった':'普段より動作がゆっくりでした','普段より会話が少なかった':'普段より会話が少なめでした'
 };
 const reactionSentences={
  'うなずいて応じた':'本人はうなずいて応じられました','声かけにうなずいて応じた':'本人は声かけにうなずいて応じられました','本人が自分で服薬した':'本人は自分で服薬されました',
  '自分の希望を伝えた':'本人から希望が伝えられました','介助を断る意思を示した':'本人は介助を断る意思を示されました','表情が和らいだ':'本人の表情が和らぎました',
  '服薬を拒否した':'本人は服薬を拒否されました','服薬に時間を要した':'服薬に時間を要していました','自分で食具を操作した':'本人が自分で食具を操作されました',
  '食事を希望する発言があった':'本人から食事を希望する発言がありました','食事を断る意思を示した':'本人は食事を断る意思を示されました','食事に時間を要した':'食事に時間を要しました',
  '排泄の希望を伝えた':'本人から排泄の希望が伝えられました','排泄時に痛みを訴えた':'排泄時に本人から痛みの訴えがありました','排泄に時間を要した':'排泄に時間を要しました',
  '入浴を希望した':'本人から入浴の希望がありました','入浴を断る意思を示した':'本人は入浴を断る意思を示されました','入浴中に疲れを訴えた':'入浴中に本人から疲れの訴えがありました',
  '自分で衣類を選んだ':'本人が自分で衣類を選ばれました','更衣を断る意思を示した':'本人は更衣を断る意思を示されました',
  '自分で歯ブラシを持った':'本人が自分で歯ブラシを持たれました','口腔ケアを断る意思を示した':'本人は口腔ケアを断る意思を示されました',
  '起床の声かけに返事をした':'本人は起床の声かけに返事をされました','眠気を訴えた':'本人から眠気の訴えがありました','自分から起き上がった':'本人が自分から起き上がられました',
  '休みたいと伝えた':'本人から休みたいとの希望がありました','就寝の声かけに返事をした':'本人は就寝の声かけに返事をされました',
  '自分でタオルを持った':'本人が自分でタオルを持たれました','清拭を断る意思を示した':'本人は清拭を断る意思を示されました',
  '行き先の希望を伝えた':'本人から行き先の希望が伝えられました','移動中に疲れを訴えた':'移動中に本人から疲れの訴えがありました','移動に時間を要した':'移動に時間を要しました',
  '自分で商品を選んだ':'本人が自分で商品を選ばれました','外出中に疲れを訴えた':'外出中に本人から疲れの訴えがありました',
  '本人が医師へ症状を伝えた':'本人が医師へ症状を伝えられました','待ち時間に疲れを訴えた':'待ち時間に本人から疲れの訴えがありました',
  '片付けの希望を伝えた':'本人から片付けの希望が伝えられました','自分で洗濯物を畳んだ':'本人が自分で洗濯物を畳まれました'
 };
 for(const extra of Object.values(supportExtras))for(const [label,value] of extra.reactions)reactionSentences[label]=value;
 const extraAfterSentences=Object.fromEntries(Object.values(supportExtras).flatMap(extra=>extra.after));
 function selfSentence(v){const map={'上半身を洗った':'上半身は本人が自分で洗われました','髪を洗った':'洗髪は本人が行われました','体を拭いた':'体は本人が自分で拭かれました','衣類を脱いだ':'衣類を脱ぐ動作は本人が行われました','衣類を着た':'衣類を着る動作は本人が行われました','衣類を選んだ':'衣類は本人が選ばれました','衣類を下げた':'衣類を下げる動作は本人が行われました','衣類を上げた':'衣類を上げる動作は本人が行われました','排泄後に手を洗った':'排泄後、本人が自分で手を洗われました','歯を磨いた':'歯磨きは本人が行われました','口をすすいだ':'口をすすぐ動作は本人が行われました','立ち上がった':'本人が自分で立ち上がられました','歩いて移動した':'本人が自分で歩いて移動されました','食具を操作した':'食具の操作は本人が行われました','食物を口元へ運んだ':'食物を口元へ運ぶ動作は本人が行われました','手を洗った':'手洗いは本人が行われました','自分で選択した':'本人が自分で選択されました'};return map[v]||(text(v)?'本人が自分で行った内容：'+text(v):'');}
 function afterSentence(v){if(extraAfterSentences[v])return extraAfterSentences[v];if(v==='服薬後に体調の訴えがあった')return '服薬後、本人から体調についての訴えがありました';if(v==='服薬後に特に変化がなかった')return '服薬後、特に変化は見られませんでした';return ({'椅子に座って過ごした':'支援後は、椅子に座って過ごされました','ベッドで休んだ':'支援後は、ベッドで休まれました','自分で次の行動を始めた':'支援後、本人は自分で次の行動を始められました'})[v]||(v?'支援後の状態：'+text(v):'');}
 function actionClauses(a){
  const xs=unique(a.actions||[]),out=[];
  if(!xs.length&&a.confirmedService===true)return [serviceStatements[a.service],...(a.service==='服薬介助・確認'&&a.unconfirmed?['服用済みかは確認していません']:[])];
  if(a.service==='服薬介助・確認'){
   const prompt=xs.includes(serviceActions[a.service][0]),prepare=xs.includes(serviceActions[a.service][1]),confirm=xs.includes(serviceActions[a.service][2]);
   if(confirm){out.push((prepare?'服薬の準備を介助し'+(prompt?'て声をかけ、':'、'):prompt?'服薬の声かけを行い、':'')+'本人が'+((a.reactions||[]).includes('本人が自分で服薬した')?'自分で':'')+'薬を服用されたことを確認しました');}
   else {if(prompt)out.push('服薬に向けて声をかけました');if(prepare)out.push('服薬の準備を介助しました');}
   for(const v of xs)if(!serviceActions[a.service].slice(0,3).includes(v))out.push(polite(v));
   if(a.unconfirmed)out.push('服用済みかは確認していません');return out;
  }
  const assists=xs.filter(v=>v.endsWith('を介助した'));
  if(assists.length>1)out.push(assists.map(v=>v.replace(/を介助した$/,'')).join('と')+'を介助しました');
  for(const v of xs)if(assists.length<2||!assists.includes(v))out.push(polite(v));
  return out;
 }
 const serviceStatements={
  '服薬介助・確認':'服薬に関する支援を行いました','トイレ介助':'排泄に関する支援を行いました',
  '食事介助':'食事の支援を行いました','入浴介助':'入浴の支援を行いました','入浴準備':'入浴準備を行いました',
  '更衣介助':'更衣の支援を行いました','口腔ケア':'口腔ケアの支援を行いました','起床介助':'起床の支援を行いました',
  '就寝介助':'就寝に向けた支援を行いました','清容・保清':'清容・保清の支援を行いました','移動介助':'移動の支援を行いました',
  '買い物・外出支援':'買い物・外出の支援を行いました','通院等介助':'通院等の支援を行いました',
  '家事援助':'家事援助を行いました','その他':'生活上の支援を行いました'
 };
 // Bind an observed response to the matching, explicitly selected prompt.
 // Without that prompt, the response is retained independently; no action is inferred.
 const promptActions={
  '服薬介助・確認':['服薬の声かけを行った','服薬に向けて声をかけると'],
  '食事介助':['食事の際に声をかけた','食事の際に声をかけると'],
  '口腔ケア':['歯磨きの声かけを行った','歯磨きの声をかけると'],
  '起床介助':['起床の声かけを行った','起床の声をかけると','起床の声かけに返事をした','本人は返事をされました'],
  '就寝介助':['就寝準備の声かけを行った','就寝準備の声をかけると']
 };
 function supportClauses(a){
  const prompt=promptActions[a.service],response=prompt?.[2]||'声かけにうなずいて応じた';
  if(!prompt||!a.actions.includes(prompt[0])||!a.reactions?.includes(response))return {acts:actionClauses(a),reactions:a.reactions||[]};
  const remaining={...a,confirmedService:false,actions:a.actions.filter(v=>v!==prompt[0])};
  const preparation=a.service==='服薬介助・確認'&&remaining.actions.includes('服薬の準備を介助した');
  if(preparation)remaining.actions=remaining.actions.filter(v=>v!=='服薬の準備を介助した');
  return {lead:(preparation?'服薬の準備を介助しました。':'')+prompt[1]+'、'+sentence(prompt[3]||'本人はうなずいて応じられました'),acts:actionClauses(remaining),reactions:a.reactions.filter(v=>v!==response)};
 }
 let expressionCounter=0;
 function nextExpressionSeed(){const n=expressionCounter;expressionCounter=(expressionCounter+1)%1048576;return n;}
 // Mixed-radix selection, applied ONLY to controlled clauses, never to staff quotations/notes.
 function expressionPicker(seed){
  let n=Number.isSafeInteger(seed)&&seed>=0?seed:0;
  const pick=choices=>{const v=choices[n%choices.length];n=Math.floor(n/choices.length);return v;};
  return {pick,phrase(value){
   const choices=[value];
   const alternatives=[[/を介助しました$/,'の介助を行いました'],[/を行いました$/,'を実施しました'],[/に付き添いました$/,'の付き添いを行いました'],[/声をかけました$/,'声かけを行いました'],[/ことを確認しました$/,'ことを確かめました'],[/見られました$/,'見受けられました'],[/おられました$/,'いらっしゃいました'],[/うなずいて応じられました$/,'うなずきで応じられました']];
   for(const [pattern,replacement] of alternatives)if(pattern.test(value)){choices.push(value.replace(pattern,replacement));break;}
   if(choices.length===1&&/しました$/.test(value))choices.push(value.replace(/しました$/,'いたしました'));
   if(choices.length===1&&/^本人(?:[はがの]|から)/.test(value))choices.push(value.replace(/^本人/,'ご本人'));
   return pick(choices);
  }};
 }
 function compose(f,_profile,expressionSeed=0){
  const errors=validate(f);if(errors.length)return {errors,visit:'',care:''};
  const variant=expressionPicker(expressionSeed);
  const observed=new Map();
  const observation=v=>{const key=observations[v]||v;if(observed.has(key))return observed.get(key);const out=observations[v]?variant.phrase(observations[v]):text(v).replace(/ていた$/,'ておられました').replace(/だった$/,'でした').replace(/があった$/,'がありました');observed.set(key,out);return out;};
  const mode=f.lengthMode||'normal',obs=unique([f.scene,f.condition].filter(v=>v&&v!=='その他').map(observation));
  const render=xs=>joinClauses(xs,mode==='normal'&&xs.length>1?variant.pick(['normal','long']):mode);
  let visit=obs.length?variant.pick(['訪問時、','訪問時は、'])+render(obs):'';
  if(f.health&&f.health!=='その他'&&!obs.includes(observation(f.health)))visit+=(visit?'':'訪問時、')+sentence(observation(f.health));
  if(text(f.statement))visit+=sentence('本人から「'+text(f.statement)+'」との発言・訴えがありました');
  if(text(f.difference))visit+=sentence('普段との違いとして、'+(observations[f.difference]||text(f.difference)));
  if(text(f.concern))visit+=sentence(f.concern);
  const sections=[];
  for(const a of f.actions||[]){if(!performed(a))continue;
   const composed=supportClauses(a),deferUnconfirmed=a.service==='服薬介助・確認'&&a.unconfirmed&&composed.reactions.includes('服薬を拒否した');
   const acts=deferUnconfirmed?composed.acts.filter(v=>v!=='服用済みかは確認していません'):composed.acts,own=text(a.self)?sentence(selfSentence(a.self)):'';
   const method=unique(a.methods||[]).map(polite);
   const rs=unique(composed.reactions).filter(v=>!(a.service==='服薬介助・確認'&&a.actions.includes('服薬したことを確認した')&&v==='本人が自分で服薬した')).map(v=>reactionSentences[v]||text(v));
   const note=sentence(a.note),after=sentence(afterSentence(a.after));
   const lead=(composed.lead||'').split('。').filter(Boolean).map(variant.phrase).map(sentence).join('');
   let body=(own?own+'職員は':'')+lead+render(acts.map(variant.phrase).concat(method))+render(rs.map(v=>Object.values(reactionSentences).includes(v)?variant.phrase(v):v))+(deferUnconfirmed?'服用済みかは確認していません。':'')+after+note;
   if(mode==='long')body='【'+a.service+'】\n'+body;
   sections.push(body);
  }
  if(text(f.supportNote))sections.push(sentence(f.supportNote));
  if(text(f.response))sections.push(sentence('支援中、'+(reactionSentences[f.response]||text(f.response))));
  if(text(f.after))sections.push(sentence(afterSentence(f.after)));
  const care=INTRO+(mode==='long'?'\n':'')+sections.join(mode==='short'?'':'\n');
  const inputCount=[f.scene,f.condition,f.health,f.statement,f.difference,f.concern,f.supportNote,f.response,f.after].filter(text).length+(f.actions||[]).reduce((n,a)=>n+(a.confirmedService===true&&!(a.actions||[]).length?1:0)+unique(a.actions||[]).length+unique(a.reactions||[]).length+unique(a.methods||[]).length+[a.self,a.after,a.note].filter(text).length,0);
  return {errors:[],visit,care,inputCount};
 }
 const api={INTRO,supportExtras,afterFor,serviceActions,profileFields,quickChoices,reactions,selfChoices,afterChoices,medicationAfter,methodChoices,suggestions,performed,validate,compose,nextExpressionSeed,sentence};if(typeof module!=='undefined')module.exports=api;else root.NexiaFactCore=api;
})(globalThis);

// Facts supplied by the user, plus explicitly labelled fictional additions.
const minimal={version:1,date:'2026-11-21',scene:'ベッド上で側臥位で休んでいた',condition:'笑顔が見られた',health:'体調良好',interventionLevel:'active',actions:[{service:'起床介助',confirmedService:true,actions:[],reactions:[],methods:[],self:'',after:'',note:''}]};
const cases=[
 {service:'起床介助',preset:'起床介助-0',actions:['起き上がりを介助した'],reactions:['起床の声かけに返事をした'],after:'椅子に座って過ごした',anchors:[/起き上が(?:り|る動作)/,/返事/],forbidden:['入眠され','転倒','足元','覚醒状態','車椅子']},
 {service:'服薬介助・確認',preset:'服薬介助・確認-0',actions:['服薬の声かけを行った','服薬したことを確認した'],reactions:['声かけにうなずいて応じた'],after:'服薬後に特に変化がなかった',anchors:[/薬を服用されたことを(?:確認|確かめ)/,/うなず/],forbidden:['薬剤','服用量','嚥下','副作用','薬を準備']},
 {service:'トイレ介助',preset:'トイレ介助-1',actions:['パッドの交換を介助した'],self:'衣類を下げた',reactions:['排泄の希望を伝えた'],after:'椅子に座って過ごした',anchors:[/パッドの交換/,/衣類を下げる動作は本人/,/排泄の希望/],forbidden:['排便を確認','衣類の上げ下げを介助','清拭','便秘','転倒']},
 {service:'入浴介助',preset:'入浴介助-self',actions:['背部の洗身を介助した'],self:'上半身を洗った',reactions:['湯の温度の希望を伝えた'],after:'入浴支援後に休憩を希望した',anchors:[/背部の洗身/,/上半身は本人が自分で洗/,/湯の温度の希望/,/休憩したい/],forbidden:['全身','洗髪','浴槽','入浴中に疲れ','水分']},
 {service:'食事介助',preset:'食事介助-self',actions:['食事中の見守りを行った'],self:'食物を口元へ運んだ',reactions:['食べる量の希望を伝えた'],after:'食事支援後に満腹と伝えた',anchors:[/食事中.*見守り/,/食物を口元へ運ぶ動作は本人/,/食べる量の希望/,/満腹/],forbidden:['全量','むせ','嚥下','食物を口元へ運ぶ介助','食器の位置']}
];
const detailed=x=>({...minimal,interventionLevel:x.service==='食事介助'?'watch':x.service==='入浴介助'||x.service==='トイレ介助'?'partial':'active',statement:'このあと椅子で過ごしたい',difference:'普段より動作がゆっくりだった',actions:[{...minimal.actions[0],service:x.service,actions:x.actions,reactions:x.reactions,after:x.after,self:x.self||'',methods:['ゆっくり話した']}]});
module.exports={minimal,cases,detailed};

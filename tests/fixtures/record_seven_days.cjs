// All people, observations and dates here are fictional. No production data.
const base={version:1,composerRevision:3,lengthMode:'normal',scene:'',health:'',statement:'',difference:'',concern:'',supportNote:'',response:'',after:''};
const observations=['落ち着いて過ごされていた','落ち着いて過ごされていた','笑顔が見られた','不安そうな様子が見られた','疲れた様子が見られた','会話は少なめだった','笑顔が見られた'];
const groups={
 '服薬介助・確認':[
  {actions:['服薬の声かけを行った','服薬したことを確認した'],reactions:['声かけにうなずいて応じた']},
  null,
  {actions:['服薬の準備を介助した','服薬したことを確認した'],reactions:['本人が自分で服薬した']},
  {actions:['服薬の声かけを行った'],unconfirmed:true,reactions:['服薬を拒否した']},
  {actions:['服薬の声かけを行った','服薬したことを確認した'],reactions:['服薬に時間を要した']},
  {actions:['服薬の準備を介助した','服薬したことを確認した'],reactions:[],after:'服薬後に体調の訴えがあった'},
  null
 ],
 'トイレ介助':[
  {actions:['トイレへの移動を介助した'],reactions:['排泄の希望を伝えた']},null,
  {actions:['排泄中の見守りを行った'],self:'衣類を下げた',reactions:['声かけにうなずいて応じた']},
  {actions:['排泄時の衣類の上げ下げを介助した'],reactions:['排泄時に痛みを訴えた']},
  {actions:['便座への移乗を介助した'],reactions:['排泄に時間を要した']},
  {actions:['排泄後の清拭を介助した'],reactions:['排泄の希望を伝えた']},null
 ],
 '入浴介助':[
  {actions:['洗身を介助した'],reactions:['入浴を希望した']},null,
  {actions:['背部の洗身を介助した'],self:'上半身を洗った',reactions:['声かけにうなずいて応じた']},
  {actions:['入浴中の見守りを行った'],reactions:['入浴を希望した']},
  {actions:['浴槽の出入りを介助した'],reactions:['入浴中に疲れを訴えた']},
  {actions:['下肢の洗身を介助した'],self:'上半身を洗った',reactions:['入浴を希望した'],after:'椅子に座って過ごした'},null
 ],
 '食事介助':[
  {actions:['食事中の見守りを行った'],reactions:['食事を希望する発言があった']},null,
  {actions:['食事中の見守りを行った'],self:'食物を口元へ運んだ',reactions:['自分で食具を操作した']},
  {actions:['食事の際に声をかけた'],reactions:['食事を断る意思を示した']},
  {actions:['食事の際に声をかけた','食事中の見守りを行った'],reactions:['声かけにうなずいて応じた']},
  {actions:['食物を口元へ運ぶ介助を行った'],reactions:['食事に時間を要した'],after:'ベッドで休んだ'},null
 ]
};
// The fifth day's nod is a generic observed response, offered for the food prompt too.
const cases=[];
for(const [service,days] of Object.entries(groups))for(let day=0;day<7;day++){
 const a=days[day]||days[day===1?0:2];
 cases.push({id:service+'-'+(day+1),service,day:day+1,person:'架空利用者A（施設A）',facts:{...base,date:'2026-11-'+String(9+day).padStart(2,'0'),condition:observations[day],actions:[{service,confirmedService:true,actions:[],reactions:[],methods:[],self:'',after:'',note:'',...structuredClone(a)}]}});
}
module.exports={cases};

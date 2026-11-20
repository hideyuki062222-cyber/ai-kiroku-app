const empty={version:1,date:'2026-11-20',scene:'',condition:'落ち着いて過ごされていた',health:'',statement:'',difference:'',concern:'',supportNote:'',response:'',after:'',lengthMode:'normal'};
const med={service:'服薬介助・確認',actions:['服薬の声かけを行った','服薬したことを確認した'],reactions:[],methods:[],note:'',self:'',after:''};
const profile={data:{communication:{choices:['ゆっくり話す'],note:''},personalCare:{choices:['本人のペースを待つ'],note:''}},legacy:{usual:'普段はよく話す',support_method:'洗身は一部介助'}};
const cases=[
 {id:'medication',label:'服薬介助のみ',facts:{...empty,actions:[{...med}]},required:['服薬の声かけを行い','薬を服用されたことを確認しました'],forbidden:['笑顔','副作用','嚥下','体調に変化','準備を介助']},
 {id:'reaction',label:'服薬介助＋本人の反応',facts:{...empty,actions:[{...med,reactions:['声かけにうなずいて応じた']}]},required:['薬を服用されたことを確認しました','うなずいて応じられました'],forbidden:['薬剤','副作用','むせ','血圧']},
 {id:'bathing',label:'入浴介助＋自立部分と介助部分',facts:{...empty,actions:[{service:'入浴介助',actions:['下肢の洗身を介助した'],self:'上半身を洗った',reactions:['声かけにうなずいて応じた'],note:'',after:''}]},required:['下肢の洗身を介助しました','上半身は本人が自分で洗われました'],forbidden:['洗髪','浴槽','発熱','全身']},
 {id:'toilet',label:'排泄介助＋普段との違い',facts:{...empty,difference:'普段より動作がゆっくりだった',actions:[{service:'トイレ介助',actions:['排泄時の衣類の上げ下げを介助した'],reactions:['排泄の希望を伝えた'],self:'',note:'',after:''}]},required:['動作がゆっくりでした','衣類の上げ下げを介助しました','排泄の希望'],forbidden:['便秘','排便を確認','転倒','疼痛']},
 {id:'different-day',label:'同じ利用者で異なる日の記録',facts:{...empty,date:'2026-11-19',condition:'疲れた様子が見られた',actions:[{...med,reactions:['服薬に時間を要した']}]},required:['疲れた様子が見られました','服薬に時間を要していました'],forbidden:['落ち着いて','体調不良','副作用']},
 {id:'different-resident',label:'異なる利用者で同じサービス',facts:{...empty,condition:'笑顔が見られた',actions:[{...med,reactions:['声かけにうなずいて応じた']}]},required:['笑顔が見られました','うなずいて応じられました'],forbidden:['普段はよく話す','洗身']},
 {id:'profile',label:'プロフィールあり・なし',profile,facts:{...empty,actions:[{...med}]},required:['薬を服用されたことを確認しました'],forbidden:['普段はよく話す','洗身','ゆっくり話しました','ペースを待ちました']},
 {id:'minimal',label:'最小限の入力',facts:{...empty,actions:[{...med,actions:['服薬の声かけを行った'],unconfirmed:true}]},required:['服薬に向けて声をかけ','服用済みかは確認していません'],forbidden:['服用された','服薬されました','副作用','変化は見られません']},
 {id:'detailed',label:'詳しい観察あり',profile,facts:{...empty,scene:'椅子・座椅子に座っていた',health:'痛みの訴えがあった',statement:'右膝が痛い',difference:'普段より動作がゆっくりだった',concern:'立ち上がる前に一度手を止めた',actions:[{...med,reactions:['本人が自分で服薬した'],methods:['ゆっくり話した'],after:'服薬後に体調の訴えがあった',note:'本人から「お腹が重い」との発言があった'}]},required:['右膝が痛い','手を止めた','自分で薬を服用','ゆっくり話しました','服薬後、本人から体調についての訴え','お腹が重い'],forbidden:['副作用','嚥下','鎮痛薬','洗身','医師に連絡']}
];
module.exports={empty,med,profile,cases};

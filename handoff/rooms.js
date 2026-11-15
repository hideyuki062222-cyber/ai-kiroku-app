/* Presentation-only room grouping. Resident IDs, entries and stored values stay intact. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.HandoffRooms=api;})(typeof globalThis==='object'?globalThis:this,()=>{
 'use strict';
 const natural=new Intl.Collator('ja',{numeric:true,sensitivity:'base'});
 const roomLabel=client=>String(client.room_number||'').normalize('NFKC').trim()||String(client.code||'').normalize('NFKC').trim();
 function group(clients,entries){
  const groups=new Map(),byClient=new Map();
  for(const client of clients){
   if(byClient.has(client.id))continue;
   // Known vacant rooms keep their number, without a retired resident's name or entries.
   if(!client.is_active&&!String(client.room_number||'').trim())continue;
   const room=roomLabel(client),key=room?'room:'+room:'client:'+client.id;
   if(!groups.has(key))groups.set(key,{key,room,clients:[],entries:[]});
   if(client.is_active){const row=groups.get(key);row.clients.push(client);byClient.set(client.id,row);}
  }
  for(const entry of entries)if(entry.scope!=='general')byClient.get(entry.client_id)?.entries.push(entry);
  return [...groups.values()].sort((a,b)=>Number(!a.room)-Number(!b.room)||natural.compare(a.room,b.room)||a.room.localeCompare(b.room,'ja')||a.key.localeCompare(b.key));
 }
 return Object.freeze({roomLabel,group});
});

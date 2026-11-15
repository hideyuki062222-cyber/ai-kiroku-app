/* Pure handoff rules shared by the screen and regression tests. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.HandoffRules=api;})(typeof globalThis==='object'?globalThis:this,()=>{
 'use strict';
 const date=(value=new Date())=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(value);
 const carry=e=>!e.archived&&!e.resolved&&(e.carry_over||!!e.due_date);
 const inShift=(e,shift)=>shift==='all'||e.shift===shift||carry(e);
 const onDay=(e,day)=>!e.archived&&(e.service_date===day||(e.service_date<day&&carry(e)));
 const overdue=(e,now=new Date())=>!e.archived&&!e.resolved&&!!e.due_date&&now.getTime()>new Date(e.due_date+'T'+(e.due_time?String(e.due_time).slice(0,8):'23:59:59')+'+09:00').getTime();
 const active=c=>!!c&&!c.revoked_at;
 const unread=(e,uid,receipts)=>e.created_by!==uid&&!receipts.some(c=>c.entry_id===e.id&&c.user_id===uid&&active(c));
 const awaiting=(e,members,receipts)=>members.filter(m=>m.user_id!==e.created_by&&!receipts.some(c=>c.entry_id===e.id&&c.user_id===m.user_id&&active(c)));
 const prioritize=(items,uid,receipts,now=new Date())=>[...items].sort((a,b)=>Number(overdue(b,now))-Number(overdue(a,now))||Number(b.is_important)-Number(a.is_important)||Number(unread(b,uid,receipts))-Number(unread(a,uid,receipts))||String(b.created_at).localeCompare(String(a.created_at))||String(a.id).localeCompare(String(b.id)));
 const lastCompletion=(id,events)=>events.filter(e=>e.entry_id===id&&e.action==='completed').sort((a,b)=>Number(b.workflow_revision)-Number(a.workflow_revision)||String(b.occurred_at).localeCompare(String(a.occurred_at)))[0]||null;
 return Object.freeze({date,carry,inShift,onDay,overdue,active,unread,awaiting,prioritize,lastCompletion});
});

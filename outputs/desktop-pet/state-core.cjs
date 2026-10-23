const ACTIVE = new Set(['working', 'waiting', 'recovering']);
function fresh() { return {sessions:{}, lastHookAt:0, lastEvent:null, hookEvents:0}; }
function apply(model, e) {
  if (!e.sessionId) return;
  if(e.source === 'hook') { model.lastHookAt=Math.max(model.lastHookAt,e.at); model.hookEvents++; }
  const s=model.sessions[e.sessionId] ||= {id:e.sessionId, state:'idle', turnId:'', at:0, transcript:e.transcript || null};
  if(e.transcript) s.transcript=e.transcript;
  if(e.cwd) s.cwd=e.cwd;
  // A terminal event from an older turn must not stop a newer turn.
  const staleTurn=e.turnId && s.turnId && e.turnId!==s.turnId;
  const starts=e.event==='UserPromptSubmit'||e.event==='task_started';
  if(e.at<s.at) return;
  if(staleTurn && !starts) return;
  let next;
  if(starts) { s.turnId=e.turnId; next='working'; s.pendingQuestion=false; }
  else if(e.event==='PermissionRequest') next='waiting';
  else if(e.event==='PreToolUse') {
    if(!ACTIVE.has(s.state)) return;
    if(/request_user_input/.test(e.tool||'')) {next='waiting';s.pendingQuestion=true;}
    else {next='working';s.pendingQuestion=false;}
  }
  else if(e.event==='PostToolUse') {
    if(!ACTIVE.has(s.state)) return;
    if(e.toolFailed) { next='recovering'; s.errorUntil=e.at+7000; }
    else if(s.state==='waiting' && !s.pendingQuestion) next='working';
    else next=s.state;
  }
  else if(e.event==='Stop'||e.event==='task_complete') next=s.pendingQuestion?'waiting':'complete';
  else if(e.event==='Interrupt'||e.event==='turn_aborted') { next=['error','failed','fatal_error','api_error'].includes(e.reason)?'failed':'interrupted';s.pendingQuestion=false; }
  else if(e.event==='task_failed') {next='failed';s.pendingQuestion=false;}
  else if(e.event==='SessionEnd') {if(['complete','interrupted','failed'].includes(s.state))return;next='idle';s.pendingQuestion=false;}
  else return;
  s.state=next;s.at=e.at;
  model.lastEvent={event:e.event,source:e.source,at:e.at,sessionId:e.sessionId};
}
function snapshot(model, now=Date.now()) {
  const sessions=Object.values(model.sessions);
  const active=sessions.filter(s=>ACTIVE.has(s.state));
  const working=active.filter(s=>s.state==='working'||s.state==='recovering');
  const waiting=active.filter(s=>s.state==='waiting');
  let state='idle', label='暂无任务', artState='idle', picked=null;
  if(working.length){
    picked=working.sort((a,b)=>b.at-a.at)[0];
    if(picked.state==='recovering' && picked.errorUntil>now){state='recovering';label='遇到报错 · 正在排查';artState='failed';}
    else {state='working';label='进行中';artState='working';}
  }else if(waiting.length){picked=waiting.sort((a,b)=>b.at-a.at)[0];state='waiting';label='等你确认 / 回复';artState='idle';}
  else {
    picked=sessions.filter(s=>['complete','interrupted','failed'].includes(s.state)).sort((a,b)=>b.at-a.at)[0];
    if(picked && now-picked.at<16000){
      state=picked.state;artState=state==='interrupted'?'idle':state;
      label=state==='complete'?'本轮结束 · 待查看':state==='failed'?'运行异常':'已停止';
    }
  }
  return {schema:1,state,label,artState,activeCount:working.length,waitingCount:waiting.length,
    sessionId:picked?.id||null,lastHookAt:model.lastHookAt,hookEvents:model.hookEvents,lastEvent:model.lastEvent,
    source: model.lastHookAt?'hooks':'session-recovery',updatedAt:now};
}
module.exports={fresh,apply,snapshot,ACTIVE};

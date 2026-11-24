// Gym widget server (Cloudflare Worker + one Durable Object).
// Holds ONLY the workout in progress, so the home-screen button (Shortcut) can see and change it while the
// app is closed, and sends all workout notifications as Web Push to the Gym app (so they all come from "Gym").
//
// Every request must carry ?k=<KEY> (secret). Secrets: KEY, VAPID_PRIVATE (JWK), VAPID_PUBLIC (base64url).
//   POST /next    -> the next one-button step (warm-up done, at the machine, start/finish set, stretch yes,
//                    start stretching, done stretching); the result also comes as a Gym notification
//   GET  /status  -> what is going on right now, as text (optional, for a "Gym Status" Shortcut)
//   POST /state   -> the app sends its current exercise ({snap, ack}); ops up to "ack" are already in the app
//   GET  /ops     -> button presses the app has not applied yet
//   POST /fg      -> {on}: the app is open (then it beeps itself and no rest notifications are sent); the first
//                    time you leave the app during a workout one notification says you can lock the phone
//   GET  /vapid   -> public key for the push subscription;  POST /sub -> store a push subscription
//   POST /test    -> send a test notification
//   GET  /widget  -> JSON for the (optional) Scriptable widget
//
// snap = {wid, mode, since, queue:[ex...]} + for mode 'ex' the current exercise: {exIdx, name, rest, up, sets:[{w,r,u,warm,start,end}]}
//   queue = exercises still to come, in order (each {exIdx, name, rest, up, sets}); u = unit after r, e.g. ' s'
//   up = recommended heavier weight (all working sets hit the top of the rep range last time), or null
//   mode: 'none' | 'checkin' | 'warmup' | 'moving' | 'ex' | 'stretch' | 'stretchMove' | 'stretching' | 'after'
//
// This file is ASCII-only (special characters as \u escapes) so copy-paste into the Cloudflare editor keeps them.

const CORS = {'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Methods':'GET, POST, OPTIONS', 'Access-Control-Allow-Headers':'content-type'};
const json = (o, s=200) => new Response(JSON.stringify(o), {status:s, headers:{...CORS, 'content-type':'application/json'}});
const text = (t, s=200) => new Response(t, {status:s, headers:{...CORS, 'content-type':'text/plain; charset=utf-8'}});

export default {
  async fetch(req, env){
    if(req.method==='OPTIONS') return new Response(null, {headers:CORS});
    const url=new URL(req.url);
    if(!env.KEY || url.searchParams.get('k')!==String(env.KEY).trim()) return text('Wrong or missing key', 401);
    const id=env.GYM_DO.idFromName('me');
    return env.GYM_DO.get(id).fetch(req);
  }
};

/* ---------- workout logic (pure, also used by the tests) ----------
   "Next" does every step that is ONE button in the app, once a workout runs (it never starts one).
   Every message is {title, body}: title "Gym - <exercise>", body = what happened, last line always "Next = ...". */
const D=' \u00b7 ';                       // " . " separator
const clock = ms => { ms=Math.max(0, Math.round(ms/1000)); return `${Math.floor(ms/60)}:${String(ms%60).padStart(2,'0')}`; };
const title = name => `Gym \u2013 ${name}`;
function setLabel(sets, i){
  if(sets[i].warm) return 'Warm-up set';
  const work=sets.filter(x=>!x.warm), n=work.indexOf(sets[i])+1;
  return `Set ${n}/${work.length}`;
}
const setTxt = x => `${x.w? x.w+' kg \u00d7 ' : ''}${x.r}${x.u||''}`;
const firstTodo = sets => sets.findIndex(x=>!x.start && !x.end);
// recommended heavier weight, as long as no working set is done and the sets are still lighter
const heavy = ex => { if(!ex || !ex.up) return ''; const w=(ex.sets||[]).filter(s=>!s.warm);
  return w.some(s=>s.end) || !w.some(s=>Number(s.w)<ex.up) ? '' : `${D}\u2b06 go heavier: ${ex.up} kg`; };
const STRETCH_Q = 'Next = yes, stretch (no: tap No in the app)';
const NOTHING = 'Next = nothing here' + D + 'open the app';
const msg = (t, line, next) => ({title:t, body:`${line}\n${next}`});
export function view(snap, now){
  if(!snap || !snap.mode || snap.mode==='none') return {phase:'none'};
  const q=(snap.queue||[])[0]||null;
  if(snap.mode!=='ex') return {phase:snap.mode, since:snap.since, next:q};
  const sets=snap.sets, run=sets.findIndex(x=>x.start && !x.end), todo=firstTodo(sets);
  const last=sets.filter(x=>x.end).sort((a,b)=>b.end-a.end)[0];
  const base={name:snap.name, rest:snap.rest||0, next:q};
  if(run>=0) return {...base, phase:'run', i:run, label:setLabel(sets,run), set:sets[run], since:sets[run].start};
  if(todo<0) return {...base, phase:'done'};
  if(last) return {...base, phase:'rest', i:todo, label:setLabel(sets,todo), set:sets[todo], since:last.end, restEnd:last.end+(snap.rest||0)*1000};
  return {...base, phase:'todo', i:todo, label:setLabel(sets,todo), set:sets[todo]};
}
const firstSet = q => { const i=firstTodo(q.sets); return i<0? '' : `${D}${setLabel(q.sets,i)}${D}${setTxt(q.sets[i])}`; };
export function status(snap, now){
  const v=view(snap, now);
  switch(v.phase){
    case 'none': return msg('Gym', 'No workout running', 'Next = nothing' + D + 'start a workout in the app');
    case 'checkin': return msg('Gym', 'Workout not started yet', 'Next = nothing' + D + 'start it in the app');
    case 'warmup': return msg(title('Warm-up'), `Warm-up running ${clock(now-v.since)}`, 'Next = warm-up done');
    case 'moving': return v.next ? msg(title(v.next.name), `On the way ${clock(now-v.since)}${firstSet(v.next)}${heavy(v.next)}`, "Next = I'm at the machine")
      : msg(title('All exercises done'), 'All exercises done', 'Next = finish workout');
    case 'stretch': return msg(title('Stretching?'), 'Workout done' + D + 'will you stretch?', STRETCH_Q);
    case 'stretchMove': return msg(title('Stretching'), `Moving to stretch ${clock(now-v.since)}`, 'Next = start stretching');
    case 'stretching': return msg(title('Stretching'), `Stretching ${clock(now-v.since)}`, 'Next = done stretching');
    case 'after': return msg(title('Last questions'), 'Last questions about the workout', NOTHING);
    case 'run': return msg(title(v.name), `${v.label} running ${clock(now-v.since)}${D}${setTxt(v.set)}`, 'Next = set done');
    case 'rest': return now<v.restEnd ? msg(title(v.name), `Rest ${clock(v.restEnd-now)} left${D}${v.label}${D}${setTxt(v.set)}`, `Next = start ${v.label}`)
      : msg(title(v.name), `Rest over (+${clock(now-v.restEnd)})${D}${v.label}${D}${setTxt(v.set)}`, `Next = start ${v.label}`);
    case 'todo': return msg(title(v.name), `Ready for ${v.label}${D}${setTxt(v.set)}${heavy(snap)}`, `Next = start ${v.label}`);
    case 'done': return msg(title(v.name), 'All sets done', NOTHING);
  }
  return msg('Gym', '', NOTHING);
}
export function statusText(snap, now){ const m=status(snap, now); return `${m.title}\n${m.body}`; }
// one step; the same function replays presses on a newer state from the app (false = does not fit any more)
export function applyOp(snap, op){
  if(!snap || snap.wid!==op.wid) return false;
  const m=snap.mode, q=snap.queue||[];
  switch(op.a){
    case 'checkin': if(m!=='checkin') return false; snap.mode='warmup'; snap.since=op.ts; return true;
    case 'warmupDone': if(m!=='warmup') return false; snap.mode= q.length? 'moving' : 'stretch'; snap.since=op.ts; return true;
    case 'arrive': {
      if(m!=='moving' || !q[0] || q[0].exIdx!==op.exIdx) return false;
      const e=q.shift(); Object.assign(snap, {mode:'ex', exIdx:e.exIdx, name:e.name, rest:e.rest, up:e.up||null, sets:e.sets}); return true; }
    case 'finish': if(m!=='moving' || q.length) return false; snap.mode='stretch'; snap.since=op.ts; return true;
    case 'stretchYes': if(m!=='stretch') return false; snap.mode='stretchMove'; snap.since=op.ts; return true;
    case 'stretchStart': if(m!=='stretchMove') return false; snap.mode='stretching'; snap.since=op.ts; return true;
    case 'stretchDone': if(m!=='stretching') return false; snap.mode='after'; return true;
    case 'start': case 'done': {
      if(m!=='ex' || snap.exIdx!==op.exIdx) return false;
      const x=snap.sets[op.i]; if(!x) return false;
      if(op.a==='start'){ snap.sets.forEach(y=>{ if(y!==x && y.start && !y.end) y.end=op.ts; }); x.start=op.ts; x.end=null; }
      else { if(!x.start) x.start=op.ts-1000; x.end=op.ts; }
      // last set of the last exercise: straight to the stretching question
      if(snap.sets.every(y=>y.end)){ snap.mode= q.length? 'moving' : 'stretch'; snap.since=op.ts; }
      return true; }
  }
  return false;
}
// one press of the home-screen button: returns {op, title, body} (op = null when Next can't do anything here)
export function nextStep(snap, now){
  const v=view(snap, now), base={ts:now, wid:snap&&snap.wid};
  let op=null;
  switch(v.phase){
    case 'warmup': op={a:'warmupDone'}; break;
    case 'moving': op= v.next? {a:'arrive', exIdx:v.next.exIdx} : {a:'finish'}; break;
    case 'stretch': op={a:'stretchYes'}; break;
    case 'stretchMove': op={a:'stretchStart'}; break;
    case 'stretching': op={a:'stretchDone'}; break;
    case 'run': op={a:'done', i:v.i, exIdx:snap.exIdx}; break;
    case 'todo': case 'rest': op={a:'start', i:v.i, exIdx:snap.exIdx}; break;
  }
  if(op){ op={...base, ...op}; if(!applyOp(snap, op)) op=null; }
  if(!op) return {op:null, ...status(snap, now)};
  const w=view(snap, now);
  switch(op.a){
    case 'warmupDone': return {op, ...(w.next? msg(title(w.next.name), `Warm-up done (${clock(now-v.since)})${D}on the way${firstSet(w.next)}${heavy(w.next)}`, "Next = I'm at the machine")
      : msg(title('Stretching?'), `Warm-up done (${clock(now-v.since)})${D}workout done`, STRETCH_Q))};
    case 'arrive': return {op, ...msg(title(w.name), `At the machine${D}${w.label}${D}${setTxt(w.set)}${heavy(snap)}`, `Next = start ${w.label}`)};
    case 'finish': return {op, ...msg(title('Stretching?'), 'Workout done' + D + 'will you stretch?', STRETCH_Q)};
    case 'stretchYes': return {op, ...msg(title('Stretching'), 'Moving to stretch', 'Next = start stretching')};
    case 'stretchStart': return {op, ...msg(title('Stretching'), 'Stretching started', 'Next = done stretching')};
    case 'stretchDone': return {op, ...msg(title('Last questions'), `Stretching done (${clock(now-v.since)})`, NOTHING + ' for the last questions')};
    case 'start': return {op, ...msg(title(v.name), `${v.label} started${D}${setTxt(v.set)}`, 'Next = set done')};
    case 'done': {
      const head=`${v.label} done (${clock(now-v.since)})`;
      if(w.phase==='moving') return {op, ...msg(title(v.name), `${head}${D}all sets done${D}next exercise: ${w.next.name}${firstSet(w.next)}${heavy(w.next)}`, "Next = I'm at the machine")};
      if(w.phase==='stretch') return {op, ...msg(title(v.name), `${head}${D}workout done`, STRETCH_Q)};
      return {op, ...msg(title(v.name), `${head}${D}rest ${clock(snap.rest*1000)}${D}then ${w.label}${D}${setTxt(w.set)}`, `Next = start ${w.label}`)}; }
  }
  return {op, ...status(snap, now)};
}
// the two rest notifications for the current state
export function restEvents(snap, now){
  const v=view(snap, now); if(v.phase!=='rest' || !(v.rest>0)) return [];
  const what=`${v.label}${D}${setTxt(v.set)}`, next=`Next = start ${v.label}`, ev=[];
  if(v.rest>=20) ev.push({key:v.restEnd+':warn', at:v.restEnd-10000, ...msg(title(v.name), `10 s rest left${D}${what}`, next)});
  ev.push({key:v.restEnd+':go', at:v.restEnd, ...msg(title(v.name), `Rest over${D}go${D}${what}`, next)});
  return ev.filter(e=>e.at>now-5000);
}

/* ---------- Web Push (RFC 8291 aes128gcm + VAPID) ---------- */
const enc=new TextEncoder();
const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const ub64 = s => { s=s.replace(/-/g,'+').replace(/_/g,'/'); while(s.length%4) s+='='; return Uint8Array.from(atob(s), c=>c.charCodeAt(0)); };
const cat = (...a) => { const o=new Uint8Array(a.reduce((n,x)=>n+x.length,0)); let p=0; for(const x of a){ o.set(x,p); p+=x.length; } return o; };
async function hkdf(salt, ikm, info, len){
  const k=await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({name:'HKDF', hash:'SHA-256', salt, info}, k, len*8));
}
export async function encryptPush(sub, payload){
  const uaPub=ub64(sub.keys.p256dh), auth=ub64(sub.keys.auth);
  const as=await crypto.subtle.generateKey({name:'ECDH', namedCurve:'P-256'}, true, ['deriveBits']);
  const asPub=new Uint8Array(await crypto.subtle.exportKey('raw', as.publicKey));
  const uaKey=await crypto.subtle.importKey('raw', uaPub, {name:'ECDH', namedCurve:'P-256'}, false, []);
  const shared=new Uint8Array(await crypto.subtle.deriveBits({name:'ECDH', public:uaKey}, as.privateKey, 256));
  const ikm=await hkdf(auth, shared, cat(enc.encode('WebPush: info\0'), uaPub, asPub), 32);
  const salt=crypto.getRandomValues(new Uint8Array(16));
  const cek=await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce=await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const key=await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ct=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM', iv:nonce}, key, cat(enc.encode(payload), new Uint8Array([2]))));
  return cat(salt, new Uint8Array([0,0,16,0]), new Uint8Array([65]), asPub, ct);
}
export async function vapidHeader(endpoint, env, now){
  const h=b64u(enc.encode(JSON.stringify({typ:'JWT', alg:'ES256'})));
  const c=b64u(enc.encode(JSON.stringify({aud:new URL(endpoint).origin, exp:Math.floor(now/1000)+12*3600, sub:'https://pstoblg.github.io/gym/'})));
  const key=await crypto.subtle.importKey('jwk', JSON.parse(env.VAPID_PRIVATE), {name:'ECDSA', namedCurve:'P-256'}, false, ['sign']);
  const sig=await crypto.subtle.sign({name:'ECDSA', hash:'SHA-256'}, key, enc.encode(h+'.'+c));
  return `vapid t=${h}.${c}.${b64u(sig)}, k=${String(env.VAPID_PUBLIC).trim()}`;
}
async function sendPush(sub, obj, env){
  const body=await encryptPush(sub, JSON.stringify(obj));
  return fetch(sub.endpoint, {method:'POST', body, headers:{TTL:'60', Urgency:'high', 'Content-Encoding':'aes128gcm',
    'Content-Type':'application/octet-stream', Authorization:await vapidHeader(sub.endpoint, env, Date.now())}});
}

/* ---------- the Durable Object: one per account, keeps state + alarm ---------- */
export class GymDO {
  constructor(state, env){ this.state=state; this.env=env; this.st=state.storage; }
  async get(k, d){ const v=await this.st.get(k); return v===undefined? d : v; }
  async fetch(req){
    const url=new URL(req.url), p=url.pathname, now=Date.now();
    const body = req.method==='POST' ? await req.json().catch(()=>({})) : {};
    if(p.startsWith('/coach/')) return this.coach(req, url, p, body, now);
    let snap=await this.get('snap', null), ops=await this.get('ops', []);

    if(p==='/next'){
      const r = snap? nextStep(snap, now) : {op:null, ...status(null, now)};
      if(r.op){ r.op.id=(await this.get('opSeq',0))+1; await this.st.put('opSeq', r.op.id); ops.push(r.op);
        await this.st.put({snap, ops}); await this.schedule(snap); }
      // the answer comes as a notification from the Gym app (the Shortcut needs no "Show Notification")
      const sent = await this.push({title:r.title, body:r.body}, true);
      return text(sent? r.body : `${r.title}\n${r.body}`);
    }
    if(p==='/status') return text(statusText(snap, now));
    if(p==='/state'){
      // the app is the source of truth; presses it has not seen yet are applied on top again
      ops=ops.filter(o=>o.id>(body.ack||0));
      const s=body.snap||{mode:'none'};
      if(s.mode==='none'){ // workout saved or discarded in the app: nothing of it stays on the server
        await this.st.delete(['snap','ops','events','sent','lockWid']); await this.st.deleteAlarm(); return json({ok:true, cleared:true}); }
      ops.forEach(o=>applyOp(s, o));
      await this.st.put({snap:s, ops}); await this.schedule(s);
      return json({ok:true, pending:ops.length});
    }
    if(p==='/ops') return json({ops});
    if(p==='/fg'){
      await this.st.put('fg', {on:!!body.on, at:now});
      // first time the app is left during this workout: one notification that you can lock the phone
      const v=view(snap, now), told=await this.get('lockWid', null);
      if(!body.on && v.phase!=='none' && snap.wid!==told){ await this.st.put('lockWid', snap.wid);
        const m=status(snap, now); await this.push({title:m.title, body:'You can lock the phone' + D + m.body}, true); }
      return json({ok:true}); }
    if(p==='/vapid') return json({key:this.env.VAPID_PUBLIC? String(this.env.VAPID_PUBLIC).trim() : null});
    if(p==='/sub'){
      if(!body.endpoint || !body.keys) return json({ok:false}, 400);
      const subs=(await this.get('subs', [])).filter(s=>s.endpoint!==body.endpoint);
      subs.push({endpoint:body.endpoint, keys:body.keys}); await this.st.put('subs', subs.slice(-3));
      return json({ok:true, devices:Math.min(3, subs.length)});
    }
    if(p==='/test'){ const n=await this.push({title:'Gym', body:'Test notification \u2713 Notifications work.'}, true); return json({ok:n>0, sent:n}); }
    if(p==='/widget'){ const v=view(snap, now); return json({...v, set:undefined, w:v.set&&v.set.w, r:v.set&&v.set.r}); }
    return text('Not found', 404);
  }
  /* ---------- Coach relay: phone <-> your PC (coach/bridge.mjs runs Claude Code there) ----------
     The PC keeps a WebSocket open to /coach/pc (hibernating, "ping" is answered without waking the object).
     POST /coach/send {job}  -> forwards the job (prompt, model, effort, session, training files) to the PC.
                               The training files are NOT stored here, they only pass through.
     GET  /coach/job?id=     -> the answer so far {text, tools, session, done, error, stopped, cost, limit}
     POST /coach/stop {id}   -> stop that answer;  GET /coach/status -> is the PC online (+ models, usage) */
  pc(){ return this.state.getWebSockets('pc')[0] || null; }
  async coach(req, url, p, body, now){
    if(p==='/coach/pc'){
      if(req.headers.get('Upgrade')!=='websocket') return text('Expected a WebSocket', 426);
      for(const old of this.state.getWebSockets('pc')) try{ old.close(4000, 'replaced by a new connection'); }catch(e){}
      const pair=new WebSocketPair();
      this.state.acceptWebSocket(pair[1], ['pc']);
      this.state.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
      return new Response(null, {status:101, webSocket:pair[0]});
    }
    if(p==='/coach/status'){ const ws=this.pc(); let info={}; try{ info=(ws && ws.deserializeAttachment()) || {}; }catch(e){}
      return json({online:!!ws, ...info}); }
    if(p==='/coach/send'){
      const job=body.job||{}; if(!job.id || !job.prompt) return json({ok:false, error:'Empty message'}, 400);
      const ws=this.pc(); if(!ws) return json({ok:false, error:'offline'});
      await this.st.put('job:'+job.id, {id:job.id, text:'', tools:[], session:job.session||null, done:false, at:now});
      const ids=(await this.get('jobs', [])).filter(x=>x!==job.id); ids.push(job.id);
      if(ids.length>30) await this.st.delete(ids.splice(0, ids.length-30).map(x=>'job:'+x));
      await this.st.put('jobs', ids);
      try{ ws.send(JSON.stringify({t:'job', job})); }catch(e){ return json({ok:false, error:'offline'}); }
      return json({ok:true});
    }
    if(p==='/coach/job'){ const j=await this.get('job:'+url.searchParams.get('id'), null); return json(j || {missing:true}); }
    if(p==='/coach/stop'){ const ws=this.pc(); if(ws) try{ ws.send(JSON.stringify({t:'stop', id:body.id})); }catch(e){} return json({ok:!!ws}); }
    return text('Not found', 404);
  }
  async webSocketMessage(ws, msg){
    let m; try{ m=JSON.parse(msg); }catch(e){ return; }
    if(m.t==='hello'){ ws.serializeAttachment({host:String(m.host||'').slice(0,60), models:m.models, efforts:m.efforts, busy:m.busy||0, limit:m.limit||null, at:Date.now()}); return; }
    if(m.t==='ev'){
      const k='job:'+m.id, j=await this.get(k, null); if(!j) return;
      if(m.add!=null) j.text=j.text.slice(0, m.from||0) + m.add;
      if(m.tools) j.tools=m.tools.slice(-40); if(m.session) j.session=m.session;
      if(m.done){ j.done=true; for(const f of ['error','stopped','cost','ms','limit','usage']) if(m[f]!=null) j[f]=m[f]; }
      j.at=Date.now(); await this.st.put(k, j);
    }
  }
  async webSocketClose(ws, code){
    try{ ws.close(); }catch(e){}
    if(this.pc()) return; // a newer connection took over
    // the PC went away: answers still running can't finish any more
    for(const id of await this.get('jobs', [])){ const j=await this.get('job:'+id, null);
      if(j && !j.done){ j.done=true; j.error='Your PC went offline while answering'; await this.st.put('job:'+id, j); } }
  }
  async webSocketError(ws){ await this.webSocketClose(ws, 1011); }
  async schedule(snap){
    const ev=restEvents(snap, Date.now()), sent=await this.get('sent', []);
    const todo=ev.filter(e=>!sent.includes(e.key));
    await this.st.put('events', todo);
    if(todo.length) await this.st.setAlarm(Math.min(...todo.map(e=>e.at))); else await this.st.deleteAlarm();
  }
  async alarm(){
    const now=Date.now(), events=await this.get('events', []), sent=await this.get('sent', []);
    const due=events.filter(e=>e.at<=now+500), rest=events.filter(e=>e.at>now+500);
    for(const e of due){ if(now-e.at<30000) await this.push({title:e.title, body:e.body}); sent.push(e.key); }
    await this.st.put({events:rest, sent:sent.slice(-20)});
    if(rest.length) await this.st.setAlarm(Math.min(...rest.map(e=>e.at)));
  }
  // returns how many devices got it; skipped while the app is open (it beeps itself)
  async push(msg, force){
    const fg=await this.get('fg', null);
    if(!force && fg && fg.on && Date.now()-fg.at<120000) return 0;
    if(!this.env.VAPID_PRIVATE) return 0;
    let subs=await this.get('subs', []), n=0; const keep=[];
    for(const s of subs){
      try{ const r=await sendPush(s, msg, this.env); if(r.status===404 || r.status===410) continue; if(r.ok) n++; }catch(e){}
      keep.push(s);
    }
    if(keep.length!==subs.length) await this.st.put('subs', keep);
    return n;
  }
}

// Gym widget server (Cloudflare Worker + one Durable Object).
// Holds ONLY the workout in progress, so the home-screen buttons (Shortcuts) can see and change it while the
// app is closed, and sends the rest notifications (10 s before the end, and at the end) as Web Push to the Gym app.
//
// Every request must carry ?k=<KEY> (secret). Secrets: KEY, VAPID_PRIVATE (JWK), VAPID_PUBLIC (base64url).
//   POST /next    -> the next one-button step (start workout, warm-up done, at the machine, start/finish set,
//                    finish workout, done stretching); short text for the banner
//   GET  /status  -> what is going on right now, as text
//   POST /state   -> the app sends its current exercise ({snap, ack}); ops up to "ack" are already in the app
//   GET  /ops     -> button presses the app has not applied yet
//   POST /fg      -> {on}: the app is open (then it beeps itself and no notifications are sent)
//   GET  /vapid   -> public key for the push subscription;  POST /sub -> store a push subscription
//   POST /test    -> send a test notification
//   GET  /widget  -> JSON for the (optional) Scriptable widget
//
// snap = {wid, mode, since, queue:[ex...]} + for mode 'ex' the current exercise: {exIdx, name, rest, sets:[{w,r,u,warm,start,end}]}
//   queue = exercises still to come, in order (each {exIdx, name, rest, sets}); u = unit after r, e.g. ' s'
//   mode: 'none' | 'checkin' | 'warmup' | 'moving' | 'ex' | 'stretch' | 'stretching' | 'after'

const CORS = {'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Methods':'GET, POST, OPTIONS', 'Access-Control-Allow-Headers':'content-type'};
const json = (o, s=200) => new Response(JSON.stringify(o), {status:s, headers:{...CORS, 'content-type':'application/json'}});
const text = (t, s=200) => new Response(t, {status:s, headers:{...CORS, 'content-type':'text/plain; charset=utf-8'}});

export default {
  async fetch(req, env){
    if(req.method==='OPTIONS') return new Response(null, {headers:CORS});
    const url=new URL(req.url);
    if(!env.KEY || url.searchParams.get('k')!==env.KEY) return text('Wrong or missing key', 401);
    const id=env.GYM_DO.idFromName('me');
    return env.GYM_DO.get(id).fetch(req);
  }
};

/* ---------- workout logic (pure, also used by the tests) ----------
   "Next" does every step that is ONE button in the app. Steps with a choice say "open the app". */
const clock = ms => { ms=Math.max(0, Math.round(ms/1000)); return `${Math.floor(ms/60)}:${String(ms%60).padStart(2,'0')}`; };
function setLabel(sets, i){
  if(sets[i].warm) return 'Warm-up set';
  const work=sets.filter(x=>!x.warm), n=work.indexOf(sets[i])+1;
  return `Set ${n}/${work.length}`;
}
const setTxt = x => `${x.w? x.w+' kg × ' : ''}${x.r}${x.u||''}`;
const firstTodo = sets => sets.findIndex(x=>!x.start && !x.end);
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
const OPEN = ' · open the app (no single Next step here)';
const firstSet = q => { const i=firstTodo(q.sets); return i<0? '' : ` · ${setLabel(q.sets,i)} · ${setTxt(q.sets[i])}`; };
export function statusText(snap, now){
  const v=view(snap, now);
  switch(v.phase){
    case 'none': return 'No workout running';
    case 'checkin': return 'Workout not started · Next = start workout (warm-up)';
    case 'warmup': return `Warm-up ${clock(now-v.since)} · Next = warm-up done`;
    case 'moving': return v.next ? `On the way to ${v.next.name} (${clock(now-v.since)})${firstSet(v.next)} · Next = I'm at the machine`
      : 'All exercises done · Next = finish workout';
    case 'stretch': return 'Will you stretch?' + OPEN;
    case 'stretching': return `Stretching ${clock(now-v.since)} · Next = done stretching`;
    case 'after': return 'Last questions about the workout' + OPEN;
    case 'run': return `▶ ${v.label} running ${clock(now-v.since)} · ${setTxt(v.set)} · ${v.name} · Next = set done`;
    case 'rest': return now<v.restEnd ? `⏸ Rest ${clock(v.restEnd-now)} left · next: ${v.label} · ${setTxt(v.set)} · ${v.name}`
      : `▶ Rest over (+${clock(now-v.restEnd)}) · ${v.label} · ${setTxt(v.set)} · ${v.name} · Next = start set`;
    case 'todo': return `${v.name} · ready for ${v.label} · ${setTxt(v.set)} · Next = start set`;
    case 'done': return `All sets of ${v.name} done` + OPEN;
  }
  return '';
}
// one step; the same function replays presses on a newer state from the app (false = does not fit any more)
export function applyOp(snap, op){
  if(!snap || snap.wid!==op.wid) return false;
  const m=snap.mode, q=snap.queue||[];
  switch(op.a){
    case 'checkin': if(m!=='checkin') return false; snap.mode='warmup'; snap.since=op.ts; return true;
    case 'warmupDone': if(m!=='warmup') return false; snap.mode='moving'; snap.since=op.ts; return true;
    case 'arrive': {
      if(m!=='moving' || !q[0] || q[0].exIdx!==op.exIdx) return false;
      const e=q.shift(); Object.assign(snap, {mode:'ex', exIdx:e.exIdx, name:e.name, rest:e.rest, sets:e.sets}); return true; }
    case 'finish': if(m!=='moving' || q.length) return false; snap.mode='stretch'; return true;
    case 'stretchDone': if(m!=='stretching') return false; snap.mode='after'; return true;
    case 'start': case 'done': {
      if(m!=='ex' || snap.exIdx!==op.exIdx) return false;
      const x=snap.sets[op.i]; if(!x) return false;
      if(op.a==='start'){ snap.sets.forEach(y=>{ if(y!==x && y.start && !y.end) y.end=op.ts; }); x.start=op.ts; x.end=null; }
      else { if(!x.start) x.start=op.ts-1000; x.end=op.ts; }
      if(snap.sets.every(y=>y.end)){ snap.mode='moving'; snap.since=op.ts; }
      return true; }
  }
  return false;
}
// one press of the home-screen button: returns {op, msg} (op = null when Next can't do anything here)
export function nextStep(snap, now){
  const v=view(snap, now), base={ts:now, wid:snap&&snap.wid};
  let op=null;
  switch(v.phase){
    case 'checkin': op={a:'checkin'}; break;
    case 'warmup': op={a:'warmupDone'}; break;
    case 'moving': op= v.next? {a:'arrive', exIdx:v.next.exIdx} : {a:'finish'}; break;
    case 'stretching': op={a:'stretchDone'}; break;
    case 'run': op={a:'done', i:v.i, exIdx:snap.exIdx}; break;
    case 'todo': case 'rest': op={a:'start', i:v.i, exIdx:snap.exIdx}; break;
  }
  if(!op) return {op:null, msg:statusText(snap, now)};
  op={...base, ...op};
  if(!applyOp(snap, op)) return {op:null, msg:statusText(snap, now)};
  const w=view(snap, now), atMachine = w.next? ` · next: ${w.next.name} · press Next when you're at the machine` : ' · press Next to finish the workout';
  switch(op.a){
    case 'checkin': return {op, msg:'▶ Workout started · warm-up running · press Next when the warm-up is done'};
    case 'warmupDone': return {op, msg:`✓ Warm-up done (${clock(now-v.since)})` + atMachine};
    case 'arrive': return {op, msg:`📍 ${w.name} · ${w.label} · ${setTxt(w.set)} · press Next to start the set`};
    case 'finish': return {op, msg:'🏁 Workout finished · open the app: stretching and how it went'};
    case 'stretchDone': return {op, msg:`✓ Stretching done (${clock(now-v.since)}) · open the app for the last questions`};
    case 'start': return {op, msg:`▶ ${v.label} started · ${setTxt(v.set)} · ${v.name}`};
    case 'done': return {op, msg: w.phase==='moving' ? `✓ ${v.label} done (${clock(now-v.since)}) · all sets of ${v.name} done` + atMachine
      : `✓ ${v.label} done (${clock(now-v.since)}) · rest ${clock(snap.rest*1000)} · next: ${w.label} · ${setTxt(w.set)}`};
  }
  return {op, msg:statusText(snap, now)};
}
// the two rest notifications for the current state
export function restEvents(snap, now){
  const v=view(snap, now); if(v.phase!=='rest' || !(v.rest>0)) return [];
  const body=`Next: ${v.label} · ${setTxt(v.set)} · ${v.name}`, ev=[];
  if(v.rest>=20) ev.push({key:v.restEnd+':warn', at:v.restEnd-10000, title:'10 s rest left', body});
  ev.push({key:v.restEnd+':go', at:v.restEnd, title:'Rest over · go', body});
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
  return `vapid t=${h}.${c}.${b64u(sig)}, k=${env.VAPID_PUBLIC}`;
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
    let snap=await this.get('snap', null), ops=await this.get('ops', []);

    if(p==='/next'){
      if(!snap) return text('No workout running · open the app');
      const r=nextStep(snap, now);
      if(r.op){ r.op.id=(await this.get('opSeq',0))+1; await this.st.put('opSeq', r.op.id); ops.push(r.op);
        await this.st.put({snap, ops}); await this.schedule(snap); }
      return text(r.msg);
    }
    if(p==='/status') return text(statusText(snap, now));
    if(p==='/state'){
      // the app is the source of truth; presses it has not seen yet are applied on top again
      ops=ops.filter(o=>o.id>(body.ack||0));
      const s=body.snap||{mode:'none'};
      ops.forEach(o=>applyOp(s, o));
      await this.st.put({snap:s, ops}); await this.schedule(s);
      return json({ok:true, pending:ops.length});
    }
    if(p==='/ops') return json({ops});
    if(p==='/fg'){ await this.st.put('fg', {on:!!body.on, at:now}); return json({ok:true}); }
    if(p==='/vapid') return json({key:this.env.VAPID_PUBLIC||null});
    if(p==='/sub'){
      if(!body.endpoint || !body.keys) return json({ok:false}, 400);
      const subs=(await this.get('subs', [])).filter(s=>s.endpoint!==body.endpoint);
      subs.push({endpoint:body.endpoint, keys:body.keys}); await this.st.put('subs', subs.slice(-3));
      return json({ok:true, devices:Math.min(3, subs.length)});
    }
    if(p==='/test'){ const n=await this.push({title:'Gym', body:'Test notification ✓ Notifications work.'}, true); return json({ok:n>0, sent:n}); }
    if(p==='/widget'){ const v=view(snap, now); return json({...v, set:undefined, w:v.set&&v.set.w, r:v.set&&v.set.r}); }
    return text('Not found', 404);
  }
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

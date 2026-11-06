'use strict';
/* Gym app code. Loaded by index.html (the loader) from the `live` branch, or from local files when opened via file://. */
if(!document.getElementById('app')) document.body.insertAdjacentHTML('afterbegin', "<main id=\"app\"></main>\n<div id=\"timer\"></div>\n<nav class=\"tabs\" id=\"tabs\"></nav>\n<div id=\"modal\"></div>\n<input type=\"file\" id=\"importFile\" accept=\".json,application/json,text/plain\" style=\"display:none\">\n<input type=\"file\" id=\"verifyFile\" accept=\".json,application/json,text/plain\" style=\"display:none\">\n");
/* ================= constants & defaults ================= */
const KEY = 'gym.v1';
const LEGACY_KEY = 'ppl-log.v1';
const TYPES = ['Push','Legs','Pull'];
const WORKOUTS = [
  {key:'Push', type:'Push', boulder:false, label:'Push'},
  {key:'Legs', type:'Legs', boulder:false, label:'Legs'},
  {key:'Pull', type:'Pull', boulder:false, label:'Pull'},
  {key:'PullBoulder', type:'Pull', boulder:true, label:'Pull + Bouldering'},
];
const KINDS = {w:'Weight × reps', bw:'Bodyweight exercise (total kg) × reps', time:'Hold (sec)', dur:'Duration (min)'};
const MUSCLES = ['Chest','Shoulders','Triceps','Back','Biceps','Forearms / Grip','Quads','Hamstrings','Glutes','Calves','Core','Full body','Other'];
const SKIP_REASONS = ['No time','Work','Tired','Sick','Alcohol','Social','Pain / injury','Motivation','Other'];
const AGO = [1,2,3,5,10,15,20,30,45,60];

const ex = (name, kind, sets, target, rest, muscle) => ({name, kind, sets, target, rest, muscle});
const DEFAULT_TEMPLATES = {
  Push: { warmup:{text:'5 min light cardio, arm circles, band pull-aparts, 2×10 push-ups, 2 light sets of the first exercise', minutes:10}, exercises:[
    ex('Bench Press','w',4,'6-10',180,'Chest'),
    ex('Weighted Dips','bw',3,'6-10',150,'Chest'),
    ex('Overhead Press','w',3,'8-10',150,'Shoulders'),
    ex('Incline DB Press','w',3,'8-12',120,'Chest'),
    ex('Pike / Handstand Push-up','bw',3,'max',120,'Shoulders'),
    ex('Lateral Raise','w',3,'12-15',60,'Shoulders'),
    ex('Triceps Pushdown','w',3,'10-15',60,'Triceps'),
  ]},
  Legs: { warmup:{text:'5 min bike, leg swings, hip openers, 2×10 bodyweight squats, 2 light sets of the first exercise', minutes:10}, exercises:[
    ex('Back Squat','w',4,'6-10',180,'Quads'),
    ex('Romanian Deadlift','w',3,'8-10',150,'Hamstrings'),
    ex('Bulgarian Split Squat','w',3,'8-12',90,'Quads'),
    ex('Leg Curl','w',3,'10-15',75,'Hamstrings'),
    ex('Calf Raise','w',4,'10-15',60,'Calves'),
    ex('Hanging Leg Raise','bw',3,'10-15',60,'Core'),
  ]},
  Pull: { warmup:{text:'5 min rowing, scapular pulls, dead hangs, band face pulls, 2 light pull-up sets', minutes:10}, exercises:[
    ex('Weighted Pull-up','bw',4,'5-8',180,'Back'),
    ex('Barbell Row','w',3,'8-10',150,'Back'),
    ex('Lat Pulldown','w',3,'10-12',90,'Back'),
    ex('Face Pull','w',3,'12-15',60,'Shoulders'),
    ex('Biceps Curl','w',3,'10-12',60,'Biceps'),
    ex('Shrugs','w',3,'10-15',60,'Back'),
    ex('Front Lever (tuck hold)','time',3,'max',120,'Core'),
  ]},
  PullBoulder: { warmup:{text:'Easy traverses, shoulder and wrist mobility, finger warm-up on big holds', minutes:15}, exercises:[
    ex('Bouldering','dur',1,'60',0,'Full body'),
    ex('Pull-up','bw',3,'max',150,'Back'),
    ex('Cable Row','w',3,'10-12',90,'Back'),
    ex('Biceps Curl','w',3,'10-12',60,'Biceps'),
    ex('Shrugs','w',3,'12-15',60,'Back'),
  ]},
};
function defaultMuscle(name){ for(const t of Object.values(DEFAULT_TEMPLATES)){ const e=t.exercises.find(x=>x.name===name); if(e) return e.muscle; } return 'Other'; }

/* ================= storage & migration =================
   Everything lives in this device's localStorage (and in iCloud Drive via the backup Shortcut). Nothing is sent anywhere else. */
function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,7); }
function num(v){ const n=parseFloat(String(v??'').replace(',','.')); return isFinite(n)? n : 0; }
function localToday(){ const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function defaultState(){
  return {
    v:3,
    profile:{ name:'', onboarded:false, obStep:0 },
    settings:{ rotation:[...TYPES], restDays:[4,0], skipAdvances:false, boulderEvery2nd:true, planStart:localToday(), maxInRow:0,
      defaultRest:120, sound:true, nextOverride:null, theme:'auto',
      step:0.25, icloudAuto:true, icloudShortcut:'Gym Save', icloudLast:0, healthShortcut:'Gym Health',
      backupToken:null, backupVerified:0 },
    templates: JSON.parse(JSON.stringify(DEFAULT_TEMPLATES)),
    planPins: {}, moves: [],
    sessions: [], bodyweight: [], active: null, healthPending: null, lastChange: 0,
  };
}
function load(){
  for(const k of [KEY, LEGACY_KEY]){
    try{ const s = JSON.parse(localStorage.getItem(k)); if(s && s.v) return migrate(s); }catch(e){}
  }
  return defaultState();
}
function migrate(s){
  const d = defaultState();
  s.settings = Object.assign({}, d.settings, s.settings||{});
  if(s.settings.icloudShortcut==='PPL Save') s.settings.icloudShortcut='Gym Save';
  if(s.settings.healthShortcut==='PPL Health') s.settings.healthShortcut='Gym Health';
  s.profile = Object.assign({}, d.profile, s.profile||{});
  s.sessions = s.sessions||[]; s.bodyweight = s.bodyweight||[]; s.planPins = s.planPins||{}; s.moves = s.moves||[];
  s.templates = s.templates||{};
  for(const k of Object.keys(DEFAULT_TEMPLATES)){
    let t = s.templates[k];
    if(!t) t = JSON.parse(JSON.stringify(DEFAULT_TEMPLATES[k]));
    else if(Array.isArray(t)) t = {warmup: JSON.parse(JSON.stringify(DEFAULT_TEMPLATES[k].warmup)), exercises:t};
    t.exercises.forEach(e=>{ if(!e.muscle) e.muscle = defaultMuscle(e.name); });
    s.templates[k] = t;
  }
  if(s.v < 2){
    // v1 stored "+kg" for bodyweight exercises; v2+ stores the total (bodyweight + added)
    const bwAt = date => { const l=s.bodyweight.filter(b=>b.date<=date).sort((a,b)=>a.date<b.date?-1:1); return l.length? l[l.length-1].kg : 0; };
    s.sessions.forEach(ses=>(ses.exercises||[]).forEach(e=>{ if(!e.muscle) e.muscle=defaultMuscle(e.name); if(e.kind==='bw') e.sets.forEach(x=>{ x.w = bwAt(ses.date) + num(x.w); }); }));
    s.active = null; // old in-progress format is not compatible with the wizard
  }
  s.v = 3;
  return s;
}
let S = load();
function save(touch=true){ if(touch) S.lastChange=Date.now(); try{ localStorage.setItem(KEY, JSON.stringify(S)); }catch(e){ toast('Could not save: '+e.message); } }
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(()=>{});

/* ---- Apple Shortcuts bridges (iCloud Drive backup, Apple Health) ---- */
function runShortcut(name, input, text){
  let url = 'shortcuts://run-shortcut?name=' + encodeURIComponent(name) + '&input=' + input;
  if(text!=null) url += '&text=' + encodeURIComponent(text);
  location.href = url;
}
// Must be called from a tap handler (clipboard access needs a user gesture).
function saveToICloud(){
  const json = JSON.stringify(Object.assign({}, S, {active:null}), null, 1);
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(json).then(()=>{
    S.settings.icloudLast = Date.now(); save(false); runShortcut(S.settings.icloudShortcut||'Gym Save','clipboard');
  }, e=>toast('Clipboard blocked: '+e.message));
  else toast('Clipboard not available. Use Export backup instead.');
}
const icloudDirty = () => (S.lastChange||0) > (S.settings.icloudLast||0);
// Backup check: save with a fresh token, then the user picks data.json and we compare the token.
function backupTest(){ S.settings.backupToken = uid(); save(false); saveToICloud(); }
function verifyBackupFile(text){
  try{
    const d = JSON.parse(text);
    if(!d.settings || !d.settings.backupToken) throw new Error('This file has no test marker. Run the test backup first.');
    if(d.settings.backupToken !== S.settings.backupToken) throw new Error('This is an older backup. Run the test again and pick the new data.json.');
    S.settings.backupVerified = Date.now(); save(false); render(); toast('iCloud backup works ✓');
  }catch(e){ toast('Check failed: '+e.message); }
}
function backupCheckHtml(){
  const st=S.settings;
  return `<div class="small" style="margin:6px 0 10px">Status: ${st.backupVerified? `<span class="ok">✓ verified ${new Date(st.backupVerified).toLocaleDateString('de-CH')}</span>` : '<span class="err">not verified yet</span>'}</div>
  <button class="primary big" data-act="bkTest">1. Run test backup</button>
  <button class="big" style="margin-top:8px" data-act="bkVerify" ${st.backupToken?'':'disabled'}>2. Pick Gym/data.json to confirm</button>`;
}
function shortcutSaveSteps(){
  const n = esc(S.settings.icloudShortcut||'Gym Save');
  return `<ol class="small ink2">
    <li>Open <b>Shortcuts</b> → <b>+</b>, name it <b>${n}</b>.</li>
    <li><b>Get Clipboard</b></li>
    <li><b>Set Name</b> → <code>data.json</code></li>
    <li><b>Save File</b> → Ask Where to Save <b>off</b>, folder <b>iCloud Drive/Gym</b>, Overwrite <b>on</b></li>
    <li><b>Get Clipboard</b> (again) → <b>Set Name</b> → <code>data-</code> + <i>Current Date</i> (format <code>yyyy-MM-dd</code>) + <code>.json</code></li>
    <li><b>Save File</b> → folder <b>iCloud Drive/Gym/backups</b>, Overwrite <b>on</b></li>
    <li>On the first run pick <b>Always Allow</b> for clipboard and folder access.</li></ol>`;
}
const fmtStamp = ts => { const d=new Date(ts); return `${iso(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };
function requestHealth(target, start, end){ // target: 'active' or a session id
  if(!start || !end){ toast('Start and end time are needed'); return; }
  S.healthPending = {target, at:Date.now()}; save(false);
  runShortcut(S.settings.healthShortcut||'Gym Health','text', `${fmtStamp(start)}|${fmtStamp(end)}`);
}
async function pasteHealth(){
  try{
    const d = JSON.parse(await navigator.clipboard.readText());
    const h = {steps:Math.round(num(d.steps)), kcal:Math.round(num(d.kcal)), hrAvg:Math.round(num(d.hrAvg)), hrMax:Math.round(num(d.hrMax))};
    const tgt = S.healthPending && S.healthPending.target;
    if(tgt==='active' && S.active) S.active.health = h;
    else { const s=S.sessions.find(x=>x.id===tgt); if(!s) throw new Error('No workout waiting for health data'); s.health=h; }
    S.healthPending = null; save(); closeModal(); render(); toast(`Health data added: ${h.steps} steps, ${h.kcal} kcal`);
  }catch(e){ toast('Could not read health data: '+e.message); }
}

/* ================= helpers ================= */
const $ = s=>document.querySelector(s);
const esc = s => String(s??'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad = n => String(n).padStart(2,'0');
const iso = (d=new Date()) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const parseISO = s => { const [y,m,d]=s.split('-').map(Number); return new Date(y,m-1,d); };
const addDays = (s,n) => { const d=parseISO(s); d.setDate(d.getDate()+n); return iso(d); };
const mondayOf = s => { const d=parseISO(s); const wd=(d.getDay()+6)%7; d.setDate(d.getDate()-wd); return iso(d); };
const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const fmtDate = s => { const d=parseISO(s); return `${DOW[d.getDay()]} ${d.getDate()}.${d.getMonth()+1}.`; };
const fmtDur = ms => { const m=Math.max(0,Math.round(ms/60000)); return m>=60? `${Math.floor(m/60)}h ${m%60}m` : `${m}m`; };
const fmtClock = ms => { const s=Math.max(0,Math.floor(ms/1000)); const h=Math.floor(s/3600); return h? `${h}:${pad(Math.floor(s/60)%60)}:${pad(s%60)}` : `${Math.floor(s/60)}:${pad(s%60)}`; };
const fmtTime = ts => { const d=new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const fmtNum = n => n>=10000? (n/1000).toFixed(1)+'k' : n>=100? Math.round(n).toLocaleString('de-CH') : (Math.round(n*10)/10).toLocaleString('de-CH');
const fw = n => String(Math.round(num(n)*100)/100);
const sortSessions = arr => arr.slice().sort((a,b)=> a.date===b.date ? (a.start||0)-(b.start||0) : a.date<b.date?-1:1);
const hasWeight = e => e.kind==='w' || e.kind==='bw';
const unitOf = e => e.kind==='time'?'s':e.kind==='dur'?'min':'kg';

function latestBW(beforeDate){
  const list = S.bodyweight.filter(b=>!beforeDate || b.date<=beforeDate).sort((a,b)=>a.date<b.date?-1:1);
  return list.length? list[list.length-1].kg : 0;
}
function setLoad(e, s){ return hasWeight(e)? num(s.w)*num(s.r) : 0; }
function e1rm(e, s){ const r=num(s.r), w=num(s.w); if(!r||!w||!hasWeight(e)) return 0; return r===1? w : w*(1+Math.min(r,15)/30); }
function sessionVolume(ses){ let v=0; (ses.exercises||[]).forEach(e=>e.sets.forEach(s=>{ if(s.done) v+=setLoad(e,s); })); return v; }
function sessionSets(ses){ let n=0; (ses.exercises||[]).forEach(e=>e.sets.forEach(s=>{ if(s.done) n++; })); return n; }
function doneSessions(){ return sortSessions(S.sessions.filter(s=>s.status==='done')); }
// "Top" value of an exercise in a session: heaviest weight (or longest hold / duration)
function topVal(e){ const d=e.sets.filter(s=>s.done); if(!d.length) return 0; return hasWeight(e)? Math.max(...d.map(s=>num(s.w))) : Math.max(...d.map(s=>num(s.r))); }
function setLabel(e, s){
  if(e.kind==='time') return `${s.r}s`;
  if(e.kind==='dur') return `${s.r} min`;
  return `${fw(s.w)}×${s.r||'?'}`;
}
function prevOccurrence(name, ses){ // last done exercise with that name before the given session (or overall)
  const list = doneSessions(); let idx = list.length;
  if(ses){ const i = list.findIndex(x=>x.id===ses.id); if(i>=0) idx=i; }
  for(let i=idx-1;i>=0;i--){ const e=(list[i].exercises||[]).find(x=>x.name===name && x.sets.some(s=>s.done)); if(e) return e; }
  return null;
}
function deltaHtml(d, unit){
  if(Math.abs(d)<0.001) return `<span class="same">±0</span>`;
  return d>0? `<span class="up">▲ +${fw(d)} ${unit}</span>` : `<span class="down">▼ ${fw(d)} ${unit}</span>`;
}

/* ================= planning =================
   The split (settings.rotation, e.g. Push → Legs → Pull) repeats forever and is laid onto the training days
   (every weekday except settings.restDays). Days fixed by hand (S.planPins[date] = key or 'rest') stay as they are.
   All other days are recalculated from what was actually done, so a skip or a different workout shifts the plan. */
const PLAN_KEYS = ['Push','Legs','Pull','PullBoulder'];
const SPLIT_PRESETS = [
  {label:'Push → Legs → Pull', order:['Push','Legs','Pull']},
  {label:'Push → Pull → Legs', order:['Push','Pull','Legs']},
];
const keyLabel = k => k==='PullBoulder'? 'Pull + Boulder' : k==='rest'? 'Rest' : k;
const keyShort = k => k==='PullBoulder'? 'Bldr' : k==='rest'? '–' : k;
const keyType = k => k==='PullBoulder'? 'Pull' : k;
const daysBetween = (a,b) => Math.round((parseISO(b)-parseISO(a))/86400000);
function rotationState(){
  const rot = S.settings.rotation && S.settings.rotation.length? S.settings.rotation : TYPES;
  let idx = 0;
  if (S.settings.nextOverride && rot.includes(S.settings.nextOverride)) idx = rot.indexOf(S.settings.nextOverride);
  else {
    const pool = sortSessions(S.sessions.filter(s=> s.status==='done' || (S.settings.skipAdvances && s.status==='skip')));
    const last = pool[pool.length-1];
    if (last) idx = (rot.indexOf(last.type)+1) % rot.length;
  }
  const pulls = doneSessions().filter(s=>s.type==='Pull'); const lp = pulls[pulls.length-1];
  return {rot, idx, lastBoulder: lp? !!lp.boulder : true};
}
function takeNext(st){ const type = st.rot[st.idx % st.rot.length]; return (type==='Pull' && S.settings.boulderEvery2nd && !st.lastBoulder)? 'PullBoulder' : type; }
function consume(st, key){
  const t=keyType(key), len=st.rot.length;
  if(st.rot[st.idx%len]===t) st.idx=(st.idx+1)%len;           // the expected one (also works if a workout appears twice in the split)
  else { const i=st.rot.indexOf(t); if(i>=0) st.idx=(i+1)%len; } // something else was done → continue after it
  if(t==='Pull') st.lastBoulder = key==='PullBoulder';
}
// Plan from today for n days: [{date, key ('Push'|'Legs'|'Pull'|'PullBoulder'|'rest'|null when already logged), pinned, logged}]
function planDays(n){
  const st = rotationState(), today = iso(), out = [];
  for(let i=0;i<n;i++){
    const d = addDays(today,i), logged = S.sessions.filter(s=>s.date===d), pin = S.planPins[d];
    if(logged.length){ out.push({date:d, key:null, pinned:!!pin, logged}); continue; }
    // pin 'train' = training day created by a move (workout follows the rotation); 'rest' = rest day; else a fixed workout
    const key = pin==='train'? takeNext(st) : pin || (isRestDay(d)? 'rest' : takeNext(st));
    if(key!=='rest') consume(st, key);
    out.push({date:d, key, pinned:!!pin && pin!=='train', moved:pin==='train', logged});
  }
  return out;
}

/* ---- moving a workout to a nearby rest day ----
   The planned day becomes a rest day (pin 'rest') and the rest day becomes a training day (pin 'train').
   Allowed without warning when it doesn't create more training days in a row than the limit. Every move is kept in S.moves for stats. */
function weeklyMaxRun(){ // longest run of training days in the weekly schedule (wraps around the week)
  const train=[0,1,2,3,4,5,6].map(i=>!S.settings.restDays.includes(i)); if(train.every(Boolean)) return 7;
  let best=0, run=0; for(let i=0;i<14;i++){ if(train[i%7]){ run++; best=Math.max(best,run); } else run=0; } return best;
}
const maxInRow = () => S.settings.maxInRow || weeklyMaxRun();
function trainingOn(d, pins){ if(S.sessions.some(s=>s.date===d && s.status==='done')) return true; const p=pins[d]; return p? p!=='rest' : !isRestDay(d); }
function moveCheck(from, to){
  const pins = Object.assign({}, S.planPins, {[from]:'rest', [to]:'train'});
  const a = addDays(from<to?from:to, -7), n = daysBetween(a, addDays(from<to?to:from, 7));
  let run=0, max=0; for(let i=0;i<=n;i++){ if(trainingOn(addDays(a,i), pins)){ run++; max=Math.max(max,run); } else run=0; }
  return {run:max, ok:max<=maxInRow()};
}
function moveCandidates(from){
  const out=[];
  for(const off of [-3,-2,-1,1,2,3]){ const d=addDays(from,off);
    if(S.sessions.some(s=>s.date===d)) continue;
    const p=S.planPins[d]; if(!(p? p==='rest' : isRestDay(d))) continue;
    if(S.moves.some(m=>m.from===d)) continue; // already freed by another move
    out.push(Object.assign({date:d}, moveCheck(from,d))); }
  return out;
}
function plannedKeyOn(d){ const p=planFor(d); return p && p.key && p.key!=='rest'? p.key : nextPlan().key; }
function undoMove(id){ const m=S.moves.find(x=>x.id===id); if(!m) return; if(S.planPins[m.from]==='rest') delete S.planPins[m.from]; if(S.planPins[m.to]==='train') delete S.planPins[m.to]; S.moves=S.moves.filter(x=>x.id!==id); }
function planFor(d){ const n=daysBetween(iso(),d); return n<0? null : planDays(n+1)[n]; }
function autoKeyFor(d){ const p=S.planPins[d]; delete S.planPins[d]; const r=planFor(d); if(p) S.planPins[d]=p; return r? r.key : null; }
function nextPlan(){ const k = takeNext(rotationState()); return {type:keyType(k), boulder:k==='PullBoulder', key:k}; }
function todayPlan(){ return planDays(1)[0]; }
function nextTraining(){ return planDays(21).slice(1).find(p=>p.key && p.key!=='rest'); }
function isRestDay(dateISO){ return S.settings.restDays.includes(parseISO(dateISO).getDay()); }
// Past planned training days without any entry: the plan must not silently hide skips.
function unaccountedDays(){
  const out=[], today=iso(), start=S.settings.planStart||today;
  for(let i=14;i>=1;i--){ const d=addDays(today,-i); if(d<start || S.sessions.some(s=>s.date===d)) continue;
    const pin=S.planPins[d]; if(pin==='rest' || (!pin && isRestDay(d))) continue; out.push(d); }
  return out;
}
function skipStats(){
  const all = S.sessions.filter(s=>s.status==='skip');
  const mon = mondayOf(iso());
  const ord = sortSessions(S.sessions); let streak=0;
  for(let i=ord.length-1;i>=0;i--){ if(ord[i].status==='done') streak++; else break; }
  return {total:all.length, week:all.filter(s=>s.date>=mon).length, streak};
}

/* ================= shell ================= */
let VIEW = S.active ? 'workout' : 'today';
let statsRange = 'all', statsEx = null, histFilter='all', calMonth = iso().slice(0,7);
const ICONS = {
  today:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
  workout:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 7v10M18 7v10M3 10v4M21 10v4M6 12h12"/></svg>',
  history:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  stats:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  settings:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/></svg>',
};
function renderTabs(){
  if(!S.profile.onboarded){ $('#tabs').innerHTML=''; return; }
  const tabs = [['today','Today'],...(S.active?[['workout','Workout']]:[]),['history','History'],['stats','Stats'],['settings','Settings']];
  $('#tabs').innerHTML = tabs.map(([k,l])=>`<button data-act="tab" data-v="${k}" class="${VIEW===k?'on':''}">${ICONS[k]}${l}</button>`).join('');
}
function render(){
  applyTheme(); renderTabs();
  if(!S.profile.onboarded){ $('#app').innerHTML = viewOnboarding(); renderTimer(); return; }
  if(VIEW==='workout' && !S.active) VIEW='today';
  $('#app').innerHTML = updateBanner() + ({today:viewToday, workout:viewWorkout, history:viewHistory, stats:viewStats, settings:viewSettings}[VIEW]||viewToday)();
  if (VIEW==='stats') mountCharts();
  renderTimer(); tick();
}
function go(v){ VIEW=v; window.scrollTo(0,0); render(); }
function toast(msg){ const t=document.createElement('div'); t.className='toast'; t.textContent=msg; document.body.appendChild(t); setTimeout(()=>t.remove(),2800); }
function applyTheme(){ const t=S.settings.theme; if(t==='auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme',t); }
const healthPasteBtn = () => S.healthPending ? `<button class="primary big" style="margin:0 0 12px" data-act="healthPaste">Paste Apple Health result</button>` : '';

/* ================= WELCOME WIZARD ================= */
const OB_STEPS = 6;
function viewOnboarding(){
  const p=S.profile, st=S.settings, step=p.obStep||0;
  const dots = `<div class="steps">${Array.from({length:OB_STEPS},(_,i)=>`<i class="${i<step?'done':i===step?'cur':''}"></i>`).join('')}</div>`;
  const nav = (nextLabel, disabled) => `<div class="grid2" style="margin-top:16px">${step>0?'<button class="big" data-act="obBack">Back</button>':'<span></span>'}<button class="primary big" data-act="obNext" ${disabled?'disabled':''}>${nextLabel||'Next'}</button></div>`;
  let body='';
  if(step===0) body = `<div class="big-emoji">🏋️</div><h1>Welcome to Gym</h1>
    <p class="ink2">Track your workouts, weights, skips, stretching and progress, all in one place.</p>
    <div class="card"><b>🔒 Your data stays yours</b><p class="small ink2" style="margin:6px 0 0">Everything is stored only on this iPhone, plus a backup file in <b>your own</b> iCloud Drive. Nothing is sent to any server.</p></div>
    ${nav("Let's go")}
    <button class="link" style="margin-top:10px" data-act="importBtn">I already have a backup (data.json) → restore it</button>`;
  else if(step===1) body = `<h1>What's your name?</h1><p class="ink2 small">Only used to greet you. Stored on this device only.</p>
    <input id="obName" data-prof="name" value="${esc(p.name)}" placeholder="Your name" autocomplete="given-name">
    ${nav('Next')}`;
  else if(step===2) body = `<h1>Your training plan</h1>
    <p class="small ink2">Your split repeats on your training days: <b>${st.rotation.map(esc).join(' → ')} → …</b>${st.boulderEvery2nd?' (every 2nd Pull day with bouldering)':''}. You can change the order and fix single days later.</p>
    <label class="f">Which workout is next for you?</label>
    <div class="chips">${st.rotation.filter((t,i,a)=>a.indexOf(t)===i).map(t=>`<button class="chip ${(st.nextOverride||st.rotation[0])===t?'on':''}" data-act="override" data-v="${t}">${t}</button>`).join('')}</div>
    <label class="f">Training days</label>
    <div class="chips">${[1,2,3,4,5,6,0].map(d=>`<button class="chip ${!st.restDays.includes(d)?'on':''}" data-act="restDay" data-v="${d}">${DOW[d]}</button>`).join('')}</div>
    <label class="f">Bodyweight today (kg, optional)</label><input id="obBW" inputmode="decimal" value="${latestBW()?fw(latestBW()):''}" placeholder="e.g. 78.5">
    <p class="small muted">You can change all of this, plus exercises and warm-ups, later in Settings.</p>
    ${nav('Next')}`;
  else if(step===3) body = `<h1>iCloud backup</h1>
    <p class="ink2 small">After every workout the app saves <b>data.json</b> to <b>iCloud Drive/Gym</b> through an Apple Shortcut. Set it up once (about 2 minutes):</p>
    <div class="card">${shortcutSaveSteps()}</div>
    <div class="card"><b>Check that it works</b>
      <p class="small ink2" style="margin:6px 0 0">Tap 1: the Shortcut saves a test backup. Come back here and tap 2, then pick <b>iCloud Drive → Gym → data.json</b>. The app checks it's the backup it just sent.</p>
      ${backupCheckHtml()}</div>
    ${nav(st.backupVerified?'Next':'Skip for now')}`;
  else if(step===4) body = `<h1>Apple Health <span class="pill">optional</span></h1>
    <p class="ink2 small">The app can add steps, active calories and heart rate for the exact workout time, using a second Shortcut (<b>${esc(st.healthShortcut)}</b>). Wear your Apple Watch, ideally with its Workout app running.</p>
    <p class="small muted">The setup guide is in Settings → Apple Health. You can do it any time.</p>
    ${nav('Next')}`;
  else body = `<div class="big-emoji">💪</div><h1>All set${p.name?', '+esc(p.name):''}!</h1>
    <ul class="small ink2"><li>Start a workout from <b>Today</b>. It guides you through warm-up and exercises.</li>
    <li>Weights are pre-filled from last time. Use <b>+/−</b> for ${fw(st.step)} kg steps.</li>
    <li>Forgot to tap Next? Use <b>Finished earlier…</b></li>
    <li>Backup: ${st.backupVerified?'<span class="ok">✓ verified</span>':'<span class="err">not verified yet</span>. You can test it in Settings.'}</li></ul>
    ${nav('Start using Gym')}`;
  return `<div class="ob">${dots}${body}</div>`;
}
function obNext(){
  const p=S.profile;
  if(p.obStep===1){ const n=($('#obName')?.value||'').trim(); if(!n){ toast('Enter your name'); return; } p.name=n; }
  if(p.obStep===2){ const k=num($('#obBW')?.value); if(k) upsertBW(iso(),k); if(!S.settings.nextOverride && !S.sessions.length) S.settings.nextOverride=S.settings.rotation[0]; }
  if(p.obStep>=OB_STEPS-1) S.settings.planStart = iso();
  if(p.obStep>=OB_STEPS-1){ p.onboarded=true; p.obStep=0; save(); go('today'); return; }
  p.obStep++; save(); window.scrollTo(0,0); render();
}

/* ================= TODAY ================= */
function dayMarks(list){ return list.map(s=> s.status==='done'?`<span class="t-${s.type}">●</span>`:'<span style="color:var(--bad)">✕</span>').join(''); }
// Marker for one day: logged entries, the planned workout (future), or a "?" for a past training day without entry
function dayCell(d, planMap, missing){
  const list=S.sessions.filter(s=>s.date===d);
  if(list.length) return dayMarks(list);
  if(S.moves.some(m=>m.from===d)) return '<span class="mv">↔</span>';
  const p=planMap[d];
  if(p && p.key) return p.key==='rest'? `<span class="muted">${p.pinned?'📌':''}–</span>` : `<span class="plan t-${keyType(p.key)}">${p.pinned?'📌':p.moved?'↔':''}${keyShort(p.key)}</span>`;
  if(missing.includes(d)) return '<span style="color:var(--warn);font-weight:700">?</span>';
  return isRestDay(d)?'<span class="muted">–</span>':'<span class="muted">·</span>';
}
// One calendar cell (Today's 2-week view and the month view). Upcoming planned training days get a dashed outline.
function calCell(ds, planMap, missing, showMonth){
  const today=iso(), list=S.sessions.filter(s=>s.date===ds), movedFrom=S.moves.some(m=>m.from===ds), p=planMap[ds];
  let cls = list.some(s=>s.status==='done')? 'cd' : list.length? 'cs' : movedFrom? 'cm' : '';
  if(!list.length && !movedFrom && ds>=today && p && p.key && p.key!=='rest') cls += ' up';
  const cell = (ds<today && !list.length && !missing.includes(ds) && !movedFrom)? '' : dayCell(ds, planMap, missing);
  const dd=parseISO(ds), label = showMonth && dd.getDate()===1? `${dd.getDate()}.${dd.getMonth()+1}.` : dd.getDate();
  return `<div class="c ${cls} ${ds===today?'today':''}" data-act="day" data-v="${ds}"><div>${label}</div><div class="st">${cell}</div></div>`;
}
const CAL_HEAD = ['Mo','Tu','We','Th','Fr','Sa','Su'].map(d=>`<div class="h">${d}</div>`).join('');
const CAL_LEGEND = `<div class="legend" style="margin:8px 0 0"><span><i style="background:color-mix(in srgb,var(--good) 35%,var(--card2))"></i>Trained</span><span><i style="background:color-mix(in srgb,var(--bad) 35%,var(--card2))"></i>Skipped</span><span><i style="background:color-mix(in srgb,var(--warn) 35%,var(--card2))"></i>Moved</span><span><i style="border:1.5px dashed var(--muted)"></i>Planned</span><span>📌 fixed · <b style="color:var(--warn)">?</b> no entry</span></div>`;
function planMapUntil(lastDate){ const n=daysBetween(iso(), lastDate); const m={}; if(n>=0) planDays(n+1).forEach(p=>m[p.date]=p); return m; }
function greeting(){ const h=new Date().getHours(); return h<11?'Good morning':h<17?'Hi':'Good evening'; }
function viewToday(){
  const today = iso(), mon = mondayOf(today), ss = skipStats();
  const tp = todayPlan(), plan = tp.key && tp.key!=='rest'? {type:keyType(tp.key), boulder:tp.key==='PullBoulder', key:tp.key} : nextPlan();
  const rest = tp.key==='rest', nt = rest? nextTraining() : null;
  const missing = unaccountedDays(), planMap = planMapUntil(addDays(mon,13));
  let cells = CAL_HEAD;
  for(let i=0;i<14;i++) cells += calCell(addDays(mon,i), planMap, missing, true);
  const ago = S.settings.icloudLast? Math.floor((Date.now()-S.settings.icloudLast)/86400000) : null;
  let banner = '';
  if(missing.length && !S.active) banner += `<div class="card" style="border-color:var(--warn)"><b>Planned training without an entry</b>
    <p class="small ink2" style="margin:4px 0 6px">Skips are never hidden. What happened?</p>
    ${missing.map(d=>`<div class="row between wrap" style="padding:6px 0;border-top:1px solid var(--line)"><span class="small"><b>${fmtDate(d)}</b></span>
      <span class="row"><button class="small no" data-act="missSkip" data-v="${d}">Skipped</button><button class="small" data-act="manualOpen" data-v="${d}">Trained</button><button class="small mvbtn" data-act="moveOpen" data-v="${d}">Moved</button></span></div>`).join('')}
    <button class="link" style="font-size:12px" data-act="missRest" data-v="${missing[0]}">${fmtDate(missing[0])} was planned wrong, it was a rest day</button></div>`;
  if(!S.active && !S.settings.backupVerified) banner += `<div class="card row between" style="border-color:var(--warn)"><div class="small"><b>iCloud backup not verified</b><br><span class="muted">Make sure your data is safe.</span></div><button class="primary" data-act="tab" data-v="settings">Check</button></div>`;
  else if(!S.active && icloudDirty()) banner += `<div class="card row between" style="border-color:var(--warn)">
    <div class="small"><b>Not saved to iCloud</b><br><span class="muted">${ago==null?'Never synced yet':'Last sync '+(ago===0?'today':ago+' day(s) ago')}</span></div>
    <button class="primary" data-act="icloudSave">Save</button></div>`;
  let main;
  if (S.active) {
    main = `<div class="card"><h2>Workout in progress</h2><p class="ink2">${esc(woLabel(S.active))} · started ${fmtTime(S.active.start)}</p><button class="primary big" data-act="tab" data-v="workout">Continue workout</button></div>`;
  } else {
    const doneToday = S.sessions.find(s=>s.date===today && s.status==='done');
    main = `<div class="card">
      <div class="row between"><span class="muted small">${doneToday?'Next in rotation':rest?'Today: rest day':'Today’s plan'}</span>${tp.pinned?'<span class="pill">📌 fixed</span>':''}</div>
      ${rest && !doneToday? `<div class="hero">Rest</div><p class="small ink2" style="margin:4px 0 0">Recovery comes before the calendar.${nt?` Next: <b>${esc(keyLabel(nt.key))}</b> on ${fmtDate(nt.date)}.`:''} You can still train today if you want to.</p>`
      : `<div class="hero t-${plan.type}">${esc(plan.type)}${plan.boulder?' + Boulder':''}</div>
      ${plan.type==='Pull' && S.settings.boulderEvery2nd?`<p class="small ink2" style="margin:4px 0 0">${plan.boulder?'Every 2nd Pull day: bouldering first, then pull-ups, rows, biceps and shrugs.':'Regular gym Pull day. The next Pull day is a bouldering day.'}</p>`:''}`}
      ${doneToday?`<p class="small" style="color:var(--good)">✓ Already trained today (${esc(doneToday.type)}).</p>`:''}
      <div class="grid2" style="margin-top:12px">
        <button class="primary big" data-act="startOpen">Start workout</button>
        <button class="big danger" data-act="skipOpen">Log skip</button>
      </div>
      ${!doneToday && !rest? '<button class="link" data-act="moveOpen" data-v="'+today+'">↔ Move today’s workout to a rest day</button>' : ''}
    </div>`;
  }
  return `<div class="row between"><h1>${greeting()}${S.profile.name?', '+esc(S.profile.name):''}</h1>${window.GymLoader?'<button class="icon ghost" data-act="updCheck" title="Check for updates">⟳</button>':''}</div>${banner}${healthPasteBtn()}${main}
  <div class="card">
    <div class="row between" style="margin-bottom:8px"><h2 style="margin:0">This & next week</h2><button class="small ghost" data-act="monthView">📅 Month</button></div>
    <div class="cal">${cells}</div>
    ${CAL_LEGEND}
    <p class="small muted" style="margin:6px 0 0">Tap a day to see it, plan it, move it, or add a workout or skip. <button class="link" style="font-size:13px" data-act="tab" data-v="settings">Edit plan</button></p>
  </div>
  <div class="grid3">
    <div class="stat"><div class="v" style="color:${ss.week?'var(--bad)':'inherit'}">${ss.week}</div><div class="l">Skips this week</div></div>
    <div class="stat"><div class="v">${ss.total}</div><div class="l">Official skip count</div></div>
    <div class="stat"><div class="v">${ss.streak}</div><div class="l">Sessions without skip</div></div>
  </div>
  <div class="card" style="margin-top:12px">
    <div class="row between"><h2 style="margin:0">Bodyweight</h2><span class="muted small">${latestBW()?fw(latestBW())+' kg':'—'}</span></div>
    <div class="row" style="margin-top:8px"><input id="bwIn" inputmode="decimal" placeholder="kg today"><button data-act="bwSave">Save</button></div>
  </div>`;
}
const woLabel = w => w.type + (w.boulder?' + Bouldering':'');

/* ================= WORKOUT WIZARD =================
   Active workout: {id,date,type,boulder,start,end,idx,stage,warmup,exercises,pre,post,notes,stretch,context,health,timer}
   idx -1 = warm-up, 0..n-1 = exercises. stage: steps → stretch → stretching → context → final.
   Each step starts when the previous one ends. Saved to localStorage on every change, so a reload resumes exactly here. */
function lastSetsFor(name){ const e=prevOccurrence(name, null); return e? e.sets.filter(s=>s.done) : []; }
function buildExercise(t){
  const prev = lastSetsFor(t.name);
  const lastW = prev.length? num(prev[prev.length-1].w) : (t.kind==='bw'? latestBW() : 0);
  const lowR = parseInt(t.target);
  const sets = Array.from({length:Math.max(1,t.sets)},(_,i)=>{ const p=prev[i]||prev[prev.length-1];
    return { w: hasWeight(t)? (p? num(p.w) : lastW) : '', r: p? String(p.r) : (isFinite(lowR)? String(lowR) : ''), done:false }; });
  return {name:t.name, kind:t.kind, muscle:t.muscle||defaultMuscle(t.name), target:t.target, rest:t.rest, sets, start:null, end:null, skipped:false};
}
function startWorkout(key, agoMin){
  const w = WORKOUTS.find(x=>x.key===key); const tpl = S.templates[key];
  const start = Date.now() - (agoMin||0)*60000;
  S.active = { id:uid(), date:iso(new Date(start)), type:w.type, boulder:w.boulder, start, end:null, idx:-1, stage:'steps',
    warmup:{text:tpl.warmup.text, minutes:tpl.warmup.minutes, start, end:null},
    exercises: tpl.exercises.map(buildExercise), pre:{}, post:{}, notes:'', stretch:null, context:null, health:null, timer:null };
  S.settings.nextOverride = null;
  save(); closeModal(); go('workout');
}
const A = () => S.active;
function curStep(){ const a=A(); return a.idx<0? a.warmup : a.exercises[a.idx]; }
function markSets(e){ e.sets.forEach(s=>{ s.done = String(s.r).trim()!=='' && (!hasWeight(e) || String(s.w).trim()!==''); }); }
function clampEnd(ts){ const c=curStep(); return Math.min(Date.now(), Math.max((c.start||A().start)+1000, ts)); }
function advance(endTs){
  const a=A(), c=curStep(); endTs = clampEnd(endTs);
  c.end = endTs;
  if(a.idx>=0 && !c.skipped) markSets(c);
  if(a.idx < a.exercises.length-1){ a.idx++; const n=curStep(); n.start=endTs; n.end=null; }
  else { a.end = endTs; a.stage='stretch'; }
  a.timer=null; save(); closeModal(); window.scrollTo(0,0); render();
}
function endEarly(endTs){
  const a=A(); endTs = clampEnd(endTs);
  const c=curStep(); c.end=endTs; if(a.idx>=0 && !c.skipped) markSets(c);
  a.exercises.slice(a.idx+1).forEach(e=>{ e.skipped=true; e.sets.forEach(s=>s.done=false); });
  a.idx = Math.max(a.idx, a.exercises.length-1); a.end=endTs; a.stage='stretch'; a.timer=null;
  save(); closeModal(); window.scrollTo(0,0); render();
}
function goBack(){
  const a=A();
  if(a.stage==='final'){ a.stage='context'; }
  else if(a.stage==='context'){ if(a.stretch && a.stretch.did){ a.stage='stretching'; a.stretch.end=null; } else { a.stage='stretch'; a.stretch=null; } }
  else if(a.stage==='stretching'){ a.stage='stretch'; a.stretch=null; }
  else if(a.stage==='stretch'){ a.stage='steps'; a.end=null; const c=curStep(); c.end=null; c.skipped=false; }
  else if(a.idx>-1){ const c=curStep(); c.start=null; a.idx--; const p=curStep(); p.end=null; p.skipped=false; }
  save(); window.scrollTo(0,0); render();
}
function stepBar(){
  const a=A(), past = i => i<a.idx || a.stage!=='steps';
  const segs=[`<i class="${a.idx>-1||a.stage!=='steps'?'done':'cur'}"></i>`];
  a.exercises.forEach((e,i)=>segs.push(`<i class="${e.skipped&&past(i)?'skip':past(i)?'done':i===a.idx?'cur':''}"></i>`));
  segs.push(`<i class="${a.stage==='final'?'cur':''}"></i>`);
  return `<div class="steps">${segs.join('')}</div>`;
}
function scaleHtml(act, key, val, labels){ return `<div class="scale">${[1,2,3,4,5].map(n=>`<button class="chip ${val===n?'on':''}" data-act="${act}" data-k="${key}" data-v="${n}">${labels?labels[n-1]:n}</button>`).join('')}</div>`; }
function viewWorkout(){
  const a=A(); if(!a) return '<div class="empty">No active workout.</div>';
  const head = `<div class="row between"><span class="small muted"><b class="t-${a.type}">${esc(woLabel(a))}</b> · started ${fmtTime(a.start)}</span><span class="pill clock" id="elapsed">${fmtClock((a.end||Date.now())-a.start)}</span></div>${stepBar()}`;
  if(a.stage==='stretch') return head + `
    <div class="card" style="text-align:center"><div class="exname">Will you stretch?</div>
    <p class="small ink2">Workout ended at ${fmtTime(a.end)} (${fmtDur(a.end-a.start)}).</p>
    <div class="grid2" style="margin-top:14px"><button class="huge yes" data-act="stretchYes">Yes</button><button class="huge no" data-act="stretchNo">No</button></div></div>
    <button class="link" data-act="back">◀ Back to last exercise</button>`;
  if(a.stage==='stretching') return head + `
    <div class="card"><div class="small muted">Stretching</div><div class="exname">Stretch</div>
    <div class="clock" style="font-size:40px;margin:10px 0" id="stepClock">${fmtClock(Date.now()-a.stretch.start)}</div>
    <button class="primary big" data-act="stretchDone">Done stretching</button>
    <button class="link" data-act="agoOpen" data-v="stretch">Finished earlier…</button></div>
    <button class="link" data-act="back">◀ Back</button>`;
  if(a.stage==='context') return head + `
    <div class="card"><div class="exname">How was your time today?</div>
    <p class="small ink2">This helps to see whether time pressure affects your training.</p>
    <button class="huge" style="margin-top:8px;background:var(--accent-soft)" data-act="ctx" data-v="limited">⏱ Time-limited<br><span class="small ink2">Had plans afterwards, had to hurry</span></button>
    <button class="huge" style="margin-top:10px;background:var(--accent-soft)" data-act="ctx" data-v="free">🧘 No plans after<br><span class="small ink2">Could take my time</span></button></div>
    <button class="link" data-act="back">◀ Back</button>`;
  if(a.stage==='final'){
    const f=a.post||{}, h=a.health;
    const doneSets = a.exercises.reduce((n,e)=>n+e.sets.filter(s=>s.done).length,0);
    return head + `<div class="card"><h2>Finish workout</h2>
      <table class="tbl"><tr><td>Time</td><td>${fmtTime(a.start)}–${fmtTime(a.end)} (${fmtDur(a.end-a.start)})</td></tr>
      <tr><td>Sets done</td><td>${doneSets}</td></tr><tr><td>Stretched</td><td>${a.stretch&&a.stretch.did?'Yes'+(a.stretch.end?' ('+fmtDur(a.stretch.end-a.stretch.start)+')':''):'No'}</td></tr>
      <tr><td>After</td><td>${a.context==='limited'?'⏱ Time-limited':'🧘 No plans'}</td></tr></table>
      <label class="f">Overall feeling</label>${scaleHtml('post','feeling',f.feeling,['😵','😕','😐','🙂','🔥'])}
      <label class="f">Effort / RPE (1 = easy, 5 = all-out)</label>${scaleHtml('post','rpe',f.rpe)}
      <label class="f">Strength / power vs. usual</label>${scaleHtml('post','power',f.power,['−−','−','=','+','++'])}
      <label class="f">Bodyweight (kg, optional)</label><input inputmode="decimal" data-post="bw" value="${esc(f.bw||'')}" placeholder="${latestBW()?fw(latestBW()):''}">
      <label class="f">Notes</label><textarea data-notes>${esc(a.notes)}</textarea>
      <label class="f">Apple Health (steps, calories, heart rate during the workout)</label>
      ${h?`<div class="small">👟 ${h.steps} steps · 🔥 ${h.kcal} kcal · ❤️ avg ${h.hrAvg||'—'} / max ${h.hrMax||'—'}</div>`:`<button class="ghost big" style="margin-bottom:8px" data-act="healthActive">Get Apple Health data</button>${healthPasteBtn()}`}
      </div>
      <button class="primary big" data-act="saveWorkout">Save workout</button>
      <div class="row between" style="margin-top:6px"><button class="link" data-act="back">◀ Back</button><button class="link" style="color:var(--bad)" data-act="discard">Discard workout</button></div>`;
  }
  const isLast = a.idx === a.exercises.length-1;
  const menu = `<div class="row between" style="margin-top:8px">${a.idx>-1?'<button class="link" data-act="back">◀ Back</button>':'<span></span>'}
    <button class="link" style="color:var(--bad)" data-act="endEarlyOpen">End workout early…</button></div>`;
  if(a.idx<0){
    const pre=a.pre||{};
    return head + `<div class="card"><div class="small muted">Step 1 of ${a.exercises.length+1}</div><div class="exname">Warm-up</div>
      <div class="clock" id="stepClock" style="font-size:22px;margin:4px 0 8px">${fmtClock(Date.now()-a.warmup.start)}</div>
      <p class="ink2" style="margin:0 0 4px">${esc(a.warmup.text)||'<span class="muted">No warm-up defined. Edit it in Settings → Workout templates.</span>'}</p>
      <div class="small muted">Planned: ${a.warmup.minutes||0} min</div></div>
      <div class="card"><h3>How do you feel?</h3>
      <label class="f">Energy</label>${scaleHtml('pre','energy',pre.energy,['😵','😕','😐','🙂','💪'])}
      <label class="f">Soreness (1 = none, 5 = very sore)</label>${scaleHtml('pre','soreness',pre.soreness)}
      <label class="f">Sleep last night (hours)</label><input inputmode="decimal" data-pre="sleep" value="${esc(pre.sleep||'')}" placeholder="e.g. 7.5"></div>
      <button class="primary big" data-act="${a.exercises.length?'next':'finishOpen'}">Warm-up done${a.exercises[0]?' → '+esc(a.exercises[0].name):''}</button>
      <button class="link" data-act="agoOpen" data-v="step">Finished earlier…</button>${menu}`;
  }
  const e=curStep(), prevE=prevOccurrence(e.name,null);
  const prevTxt = prevE? prevE.sets.filter(s=>s.done).map(s=>setLabel(prevE,s)).join(' · ') : 'First time';
  const st = S.settings.step||0.25;
  const rows = e.sets.map((s,si)=>`<tr class="${s.done?'done':''}">
    <td class="n">${si+1}</td>
    ${hasWeight(e)?`<td><div class="stp"><input inputmode="decimal" data-in="w" data-s="${si}" value="${esc(fw(s.w))}"><div class="v"><button data-act="stepW" data-s="${si}" data-v="1">+</button><button data-act="stepW" data-s="${si}" data-v="-1">−</button></div></div></td>`:''}
    <td><div class="stp"><input inputmode="numeric" data-in="r" data-s="${si}" value="${esc(s.r)}"><div class="v"><button data-act="stepR" data-s="${si}" data-v="1">+</button><button data-act="stepR" data-s="${si}" data-v="-1">−</button></div></div></td>
    <td style="width:44px"><button class="chk ${s.done?'on':''}" data-act="setDone" data-s="${si}">✓</button></td></tr>`).join('');
  return head + `<div class="card">
    <div class="row between"><span class="small muted">Exercise ${a.idx+1} of ${a.exercises.length} · ${esc(e.muscle)}</span><span class="clock" id="stepClock">${fmtClock(Date.now()-e.start)}</span></div>
    <div class="exname">${esc(e.name)}</div>
    <div class="small ink2" style="margin:2px 0 10px">Target ${e.sets.length} × ${esc(e.target)} ${e.kind==='time'?'sec':e.kind==='dur'?'min':''} · rest ${e.rest}s<br>Last time: ${esc(prevTxt)}</div>
    <table class="sets"><tr><th>#</th>${hasWeight(e)?`<th>kg (±${fw(st)})</th>`:''}<th>${e.kind==='time'?'sec':e.kind==='dur'?'min':'reps'}</th><th>rest</th></tr>${rows}</table>
    <div class="row" style="margin-top:8px"><button class="small ghost" data-act="addSet">+ Set</button>${e.sets.length>1?'<button class="small ghost" data-act="rmSet">− Set</button>':''}<span style="flex:1"></span><button class="small ghost" data-act="restEdit">Rest ${e.rest}s</button></div>
  </div>
  <button class="primary big" data-act="${isLast?'finishOpen':'next'}">${isLast?'Finish workout':'Next → '+esc(a.exercises[a.idx+1].name)}</button>
  <div class="row between"><button class="link" data-act="agoOpen" data-v="step">Finished earlier…</button><button class="link" data-act="skipEx">Skip exercise</button></div>
  ${menu}`;
}

/* ---- rest timer (persisted in the active workout) ---- */
let audioCtx = null;
function unlockAudio(){ try{ if(!audioCtx){ audioCtx = new (window.AudioContext||window.webkitAudioContext)(); } if(audioCtx.state==='suspended') audioCtx.resume(); }catch(e){} }
function beep(){
  if(!S.settings.sound || !audioCtx) return;
  try{ [0,0.25,0.5].forEach(t=>{ const o=audioCtx.createOscillator(), g=audioCtx.createGain(); o.frequency.value=880; o.connect(g); g.connect(audioCtx.destination);
      const t0=audioCtx.currentTime+t; g.gain.setValueAtTime(0.0001,t0); g.gain.exponentialRampToValueAtTime(0.4,t0+0.02); g.gain.exponentialRampToValueAtTime(0.0001,t0+0.18); o.start(t0); o.stop(t0+0.2); }); }catch(e){}
  if(navigator.vibrate) navigator.vibrate([200,100,200]);
}
function startTimer(sec){ if(!sec||!S.active) return; S.active.timer={end:Date.now()+sec*1000,total:sec,fired:false}; save(false); renderTimer(); }
function renderTimer(){
  const box=$('#timer'); const T = S.active && S.active.timer;
  if(!T || VIEW!=='workout' || !S.profile.onboarded){ box.innerHTML=''; return; }
  const left = Math.round((T.end-Date.now())/1000), over = left<=0, a=Math.abs(left);
  const pct = over?100:Math.max(0,100-left/T.total*100);
  box.innerHTML = `<div class="timerbar ${over?'over':''}"><div class="in"><div class="prog" style="width:${pct}%"></div>
    <div class="tt">${over?'Go! +':'Rest '}${Math.floor(a/60)}:${pad(a%60)}</div>
    <button data-act="tAdj" data-v="-15">−15</button><button data-act="tAdj" data-v="15">+15</button><button data-act="tStop">✕</button></div></div>`;
}
function tick(){
  const a=S.active; if(!a) return;
  const T=a.timer;
  if(T){ if(!T.fired && Date.now()>=T.end){ T.fired=true; save(false); beep(); } if(Date.now()-T.end > 5*60000){ a.timer=null; save(false); } renderTimer(); }
  const el=$('#elapsed'); if(el) el.textContent=fmtClock((a.end||Date.now())-a.start);
  const sc=$('#stepClock'); if(sc){ const st = a.stage==='stretching'? a.stretch.start : curStep().start; sc.textContent=fmtClock(Date.now()-st); }
}
setInterval(tick, 500);

function agoSheet(kind){
  const title = kind==='end'? 'End workout early?' : kind==='finish'? 'Finish workout?' : kind==='stretch'? 'When did you finish stretching?' : 'When did you finish this step?';
  const note = kind==='end'? 'The remaining exercises are marked as skipped.' : kind==='finish'? 'Next comes the stretching question.' : 'Use this if you forgot to tap Next.';
  return `<h2>${title}</h2><p class="small ink2">${note}</p>
  <button class="primary big" data-act="agoPick" data-k="${kind}" data-v="0">${kind==='end'||kind==='finish'?'Yes, finished now':'Just now'}</button>
  <label class="f">…or this many minutes ago</label>
  <div class="chips">${AGO.map(m=>`<button class="chip" data-act="agoPick" data-k="${kind}" data-v="${m}">${m} min</button>`).join('')}</div>
  <button class="big" style="margin-top:14px" data-act="closeModal">Cancel</button>`;
}
function startSheet(){
  const tp=todayPlan(), planned = tp.key && tp.key!=='rest';
  const plan = planned? {key:tp.key} : nextPlan();
  return `<h2>Start workout?</h2>
  <label class="f">What are you training today?</label>
  <select id="stKey">${WORKOUTS.map(w=>`<option value="${w.key}" ${w.key===plan.key?'selected':''}>${w.label}${w.key===plan.key?(planned?' (planned today)':' (next in rotation)'):''}</option>`).join('')}</select>
  <p class="small muted" style="margin:4px 0 0">Doing something else than planned is fine: the plan for the coming days adjusts.</p>
  <label class="f">Started</label>
  <select id="stAgo"><option value="0">Now</option>${[5,10,15,20,30,45,60].map(m=>`<option value="${m}">${m} min ago</option>`).join('')}</select>
  <div class="grid2" style="margin-top:16px"><button class="big" data-act="closeModal">Cancel</button><button class="primary big" data-act="startGo">Yes, start</button></div>`;
}
function saveWorkout(){
  const a=A();
  const bwv = num(a.post && a.post.bw); if(bwv) upsertBW(a.date,bwv);
  const prs=[];
  a.exercises.forEach(e=>{ if(!hasWeight(e)) return; const best=Math.max(0,...e.sets.filter(s=>s.done).map(s=>e1rm(e,s))); const prev=bestE1RM(e.name); if(best>0 && prev>0 && best>prev) prs.push(e.name); });
  const ses = { id:a.id, date:a.date, type:a.type, boulder:a.boulder, status:'done', start:a.start, end:a.end,
    warmup:a.warmup, exercises:a.exercises.map(e=>Object.assign({}, e, {sets:e.sets.filter(s=>s.done)})),
    pre:a.pre, post:a.post, notes:a.notes, stretch:a.stretch, context:a.context, health:a.health };
  S.sessions.push(ses); S.active=null;
  if(S.healthPending && S.healthPending.target==='active') S.healthPending=null;
  save(); go('today');
  toast(prs.length? `Saved. New PR: ${prs.join(', ')} 🎉` : 'Workout saved 💪');
  if(S.settings.icloudAuto) saveToICloud();
}
function bestE1RM(name){ let best=0; doneSessions().forEach(ses=>(ses.exercises||[]).forEach(e=>{ if(e.name===name) e.sets.forEach(s=>{ if(s.done) best=Math.max(best,e1rm(e,s)); }); })); return best; }
function upsertBW(date,kg){ const i=S.bodyweight.findIndex(b=>b.date===date); if(i>=0) S.bodyweight[i].kg=kg; else S.bodyweight.push({date,kg}); }

/* ---- skip ---- */
// One sheet for logging a skip and for adding a day afterwards: switch between "Workout" and "Skip".
let skipDraft=null;
function newDraft(o){ const np=nextPlan(); return Object.assign({mode:'skip', showMode:false, type:np.type, key:np.key, date:iso(), reason:'', instead:'', minutes:'', worth:null, note:''}, o); }
function skipSheet(){
  const d=skipDraft, isSkip = d.mode==='skip';
  const modeSeg = d.showMode? `<div class="seg"><button class="${d.mode==='done'?'on':''}" data-act="entMode" data-v="done">💪 Workout</button><button class="${isSkip?'on':''}" data-act="entMode" data-v="skip">✕ Skip</button><button class="${d.mode==='move'?'on':''}" data-act="entMode" data-v="move">↔ Moved</button></div>` : '';
  if(d.mode==='move'){
    const from=d.date, key=plannedKeyOn(from), cands=moveCandidates(from), sel=cands.find(c=>c.date===d.moveTo), today=iso();
    return `<h2>${d.showMode?'Add entry':'Move workout'}</h2>${modeSeg}
    <p class="small ink2">Move the training of <b>${fmtDate(from)}</b>${from>=today?` (<b>${esc(keyLabel(key))}</b>)`:''} to a rest day nearby. ${fmtDate(from)} becomes a rest day; the rotation simply continues. Not counted as a skip.</p>
    <label class="f">Move to</label>
    ${cands.length? `<div class="chips">${cands.map(c=>`<button class="chip ${d.moveTo===c.date?'on':''}" data-act="mvPick" data-v="${c.date}">${fmtDate(c.date)}${c.ok?' ✓':' ⚠'}</button>`).join('')}</div>`
      : '<p class="small" style="color:var(--warn)">No free rest day within 3 days. Log it as a skip instead.</p>'}
    ${sel? (sel.ok? `<p class="small ok">✓ Fine for your routine: at most ${sel.run} training days in a row.</p>`
      : `<p class="small err">⚠ That makes ${sel.run} training days in a row (your limit: ${maxInRow()}). Too much training packed together. Recovery comes first.</p>`) : ''}
    ${sel && sel.date<=today? `<label class="f">What did you train on ${fmtDate(sel.date)}?</label><select id="enKey">${WORKOUTS.map(w=>`<option value="${w.key}" ${d.key===w.key?'selected':''}>${w.label}</option>`).join('')}</select>` : ''}
    <div class="grid2" style="margin-top:16px"><button class="big" data-act="closeModal">Cancel</button>
      <button class="big ${sel && !sel.ok?'danger':'primary'}" data-act="mvSave" ${sel?'':'disabled'}>${sel && !sel.ok?'Move anyway':'Save move'}</button></div>`;
  }
  if(!isSkip) return `<h2>Add entry</h2>${modeSeg}
  <label class="f">Date</label><input type="date" id="skDate" value="${esc(d.date)}">
  <label class="f">Which workout did you do?</label><select id="enKey">${WORKOUTS.map(w=>`<option value="${w.key}" ${d.key===w.key?'selected':''}>${w.label}</option>`).join('')}</select>
  <label class="f">Note (optional)</label><input id="skNote" value="${esc(d.note)}">
  <p class="small muted">Saved without set details. The plan for the coming days adjusts to it.</p>
  <div class="grid2" style="margin-top:16px"><button class="big" data-act="closeModal">Cancel</button><button class="big primary" data-act="entSave">Save workout</button></div>`;
  return `<h2>${d.showMode?'Add entry':'Log skip'}</h2>${modeSeg}
  <p class="small ink2">This counts as an official skip.${S.settings.skipAdvances?'':' The skipped workout moves to the next training day.'}</p>
  <label class="f">Workout skipped</label><select id="skType">${TYPES.map(t=>`<option ${d.type===t?'selected':''}>${t}</option>`).join('')}</select>
  <label class="f">Date</label><input type="date" id="skDate" value="${esc(d.date)}">
  <label class="f">Reason</label><div class="chips">${SKIP_REASONS.map(r=>`<button class="chip ${d.reason===r?'on':''}" data-act="skReason" data-v="${esc(r)}">${esc(r)}</button>`).join('')}</div>
  <label class="f">What did you do instead? (opportunity cost)</label><input id="skInstead" value="${esc(d.instead)}" placeholder="e.g. dinner with friends, overtime">
  <label class="f">Time gained (min)</label><input id="skMin" inputmode="numeric" value="${esc(d.minutes)}" placeholder="e.g. 90">
  <label class="f">Was it worth it?</label>
  <div class="scale">${[-2,-1,0,1,2].map(n=>`<button class="chip ${d.worth===n?'on':''}" data-act="skWorth" data-v="${n}">${['Not at all','No','Neutral','Yes','Clearly'][n+2]}</button>`).join('')}</div>
  <label class="f">Note</label><input id="skNote" value="${esc(d.note)}">
  <div class="grid2" style="margin-top:16px"><button class="big" data-act="closeModal">Cancel</button><button class="big no" data-act="skSave">Log skip</button></div>`;
}
function readSkipInputs(){
  const val = id => { const el=document.getElementById(id); return el? el.value : null; };
  const map = {type:'skType', key:'enKey', date:'skDate', instead:'skInstead', minutes:'skMin', note:'skNote'};
  for(const [k,id] of Object.entries(map)){ const v=val(id); if(v!=null) skipDraft[k]=v; }
  if(!skipDraft.date) skipDraft.date=iso();
}

/* ================= HISTORY & DAY DETAILS ================= */
// Month calendar (used in History and Stats): green = trained, red = skipped, labels = planned, ? = no entry
function monthCalendarHtml(){
  const [y,m] = calMonth.split('-').map(Number);
  const first = new Date(y,m-1,1), startPad=(first.getDay()+6)%7, daysIn=new Date(y,m,0).getDate(), today=iso();
  const firstDay = `${y}-${pad(m)}-01`, lastDay = `${y}-${pad(m)}-${pad(daysIn)}`;
  let cells = CAL_HEAD;
  for(let i=0;i<startPad;i++) cells+='<div class="c out"></div>';
  const planMap = planMapUntil(lastDay), missing = unaccountedDays();
  for(let d=1; d<=daysIn; d++) cells += calCell(`${y}-${pad(m)}-${pad(d)}`, planMap, missing, false);
  const inMonth = S.sessions.filter(s=>s.date>=firstDay && s.date<=lastDay);
  const done = inMonth.filter(s=>s.status==='done').length, skips = inMonth.filter(s=>s.status==='skip').length;
  const moved = S.moves.filter(x=>x.from>=firstDay && x.from<=lastDay).length;
  const planned = Object.values(planMap).filter(p=>p.date>=firstDay && p.date<=lastDay && p.date>=today && p.key && p.key!=='rest').length;
  const adher = done+skips? Math.round(done/(done+skips)*100)+'%' : '—';
  return `<div class="card"><div class="row between" style="margin-bottom:8px"><button class="icon ghost" data-act="calNav" data-v="-1">‹</button><b>${MONTHS[m-1]} ${y}</b><button class="icon ghost" data-act="calNav" data-v="1">›</button></div>
    <div class="cal">${cells}</div>
    <div class="grid3" style="margin-top:10px"><div class="stat"><div class="v" style="color:var(--good)">${done}</div><div class="l">Workouts</div></div>
      <div class="stat"><div class="v" style="color:${skips?'var(--bad)':'inherit'}">${skips}</div><div class="l">Skips${moved?` · ${moved} moved`:''}</div></div>
      <div class="stat"><div class="v">${adher}</div><div class="l">Adherence${planned?` · ${planned} still planned`:''}</div></div></div>
    ${CAL_LEGEND}</div>`;
}
function viewHistory(){
  let list = sortSessions(S.sessions).reverse();
  if(histFilter!=='all') list = list.filter(s=> histFilter==='skip'? s.status==='skip' : s.type===histFilter && s.status==='done');
  const seg = ['all','Push','Legs','Pull','skip'].map(k=>`<button class="${histFilter===k?'on':''}" data-act="histF" data-v="${k}">${k==='all'?'All':k==='skip'?'Skips':k}</button>`).join('');
  const items = list.map(s=>{
    const isSkip=s.status==='skip';
    const sub = isSkip ? `Skip · ${esc(s.skip?.reason||'')}${s.skip?.instead?' · '+esc(s.skip.instead):''}`
      : `${sessionSets(s)} sets · ${fmtNum(sessionVolume(s))} kg${s.end&&s.start?' · '+fmtDur(s.end-s.start):''}${s.stretch?(s.stretch.did?' · stretched':' · no stretch'):''}`;
    return `<div class="list-item" data-act="day" data-v="${s.date}">
      <span class="dot" style="background:${isSkip?'var(--bad)':`var(--${s.type.toLowerCase()})`}"></span>
      <div style="flex:1"><div><b>${esc(s.type)}${s.boulder?' + Boulder':''}</b> <span class="muted small">${fmtDate(s.date)} ${s.date.slice(0,4)}</span></div><div class="small ink2">${sub}</div></div>
      <span class="muted">›</span></div>`;
  }).join('');
  return `<h1>History</h1>
  ${monthCalendarHtml()}
  <div class="seg">${seg}</div>
  <div class="card">${items||'<div class="empty">Nothing logged yet.</div>'}</div>
  <button class="ghost big" data-act="manualOpen">+ Add past session or skip</button>`;
}
function sessionDetail(s){
  if(s.status==='skip'){
    const k=s.skip||{};
    return `<div class="card"><h2 style="color:var(--bad)">✕ ${esc(s.type)} skipped</h2><table class="tbl"><tr><td>Reason</td><td>${esc(k.reason)}</td></tr><tr><td>Instead</td><td>${esc(k.instead||'—')}</td></tr><tr><td>Time gained</td><td>${k.minutes?esc(k.minutes)+' min':'—'}</td></tr><tr><td>Worth it</td><td>${k.worth!=null?['Not at all','No','Neutral','Yes','Clearly'][k.worth+2]:'—'}</td></tr><tr><td>Note</td><td>${esc(k.note||'—')}</td></tr></table>
      <button class="link" style="color:var(--bad)" data-act="delSes" data-id="${s.id}">Delete entry</button></div>`;
  }
  const p=s.pre||{}, q=s.post||{}, h=s.health;
  const exs = (s.exercises||[]).map(e=>{
    const prev = prevOccurrence(e.name, s);
    const d = prev && !e.skipped && e.sets.length? topVal(e)-topVal(prev) : null;
    return `<div style="padding:8px 0;border-bottom:1px solid var(--line)">
      <div class="row between"><b>${esc(e.name)}</b><span class="small muted">${e.start&&e.end?fmtDur(e.end-e.start):''}</span></div>
      ${e.skipped||!e.sets.length? '<div class="small" style="color:var(--bad)">skipped</div>' :
      `<div class="small ink2">${e.sets.map(x=>esc(setLabel(e,x))).join(' · ')}</div>
       <div class="small">${d==null?'<span class="muted">first time</span>':deltaHtml(d,unitOf(e))+' <span class="muted">vs. last time</span>'}</div>`}</div>`;
  }).join('') || '<p class="muted small">No exercise details.</p>';
  return `<div class="card">
    <h2><span class="t-${s.type}">${esc(s.type)}${s.boulder?' + Bouldering':''}</span></h2>
    <div class="small ink2">${s.start&&s.end?`${fmtTime(s.start)}–${fmtTime(s.end)} · ${fmtDur(s.end-s.start)} · `:''}${sessionSets(s)} sets · ${fmtNum(sessionVolume(s))} kg volume</div>
    <div class="chips" style="margin:8px 0">
      ${s.stretch? `<span class="pill" style="color:${s.stretch.did?'var(--good)':'var(--bad)'}">${s.stretch.did?'✓ stretched':'✕ no stretch'}</span>`:''}
      ${s.context? `<span class="pill">${s.context==='limited'?'⏱ time-limited':'🧘 no plans after'}</span>`:''}
      ${s.warmup&&s.warmup.start&&s.warmup.end? `<span class="pill">warm-up ${fmtDur(s.warmup.end-s.warmup.start)}</span>`:''}
    </div>
    ${exs}
    <table class="tbl" style="margin-top:8px"><tr><td>Energy before</td><td>${p.energy||'—'}</td><td>Feeling</td><td>${q.feeling||'—'}</td></tr><tr><td>Soreness</td><td>${p.soreness||'—'}</td><td>RPE</td><td>${q.rpe||'—'}</td></tr><tr><td>Sleep</td><td>${p.sleep||'—'}</td><td>Power</td><td>${q.power||'—'}</td></tr></table>
    ${h? `<p class="small">👟 ${h.steps} steps · 🔥 ${h.kcal} kcal · ❤️ avg ${h.hrAvg||'—'} / max ${h.hrMax||'—'}</p>` : (s.start&&s.end? `<button class="ghost big" style="margin-top:8px" data-act="healthSes" data-id="${s.id}">Get Apple Health data</button>`:'')}
    ${s.notes?`<p class="small">${esc(s.notes)}</p>`:''}
    <button class="link" style="color:var(--bad)" data-act="delSes" data-id="${s.id}">Delete workout</button></div>`;
}
let dayOpen=null;
function daySheet(date){
  const list = sortSessions(S.sessions.filter(s=>s.date===date)), today=iso();
  const mv = S.moves.find(m=>m.from===date || m.to===date);
  let planHtml = mv? `<div class="card" style="border-color:var(--warn)"><h3>↔ Moved workout</h3>
    <p class="small ink2" style="margin:0">Training moved from <b>${fmtDate(mv.from)}</b> to <b>${fmtDate(mv.to)}</b>${mv.ok===false?' (more days in a row than your limit)':''}.</p>
    <button class="link" data-act="undoMove" data-v="${mv.id}">Undo move</button></div>` : '';
  if(date>=today && !list.length && !(mv && mv.from===date)){
    const pin = S.planPins[date]==='train'? '' : S.planPins[date], auto = autoKeyFor(date);
    const opts = [['', `Auto${auto?' ('+keyLabel(auto)+')':''}`], ...PLAN_KEYS.map(k=>[k,keyLabel(k)]), ['rest','Rest']];
    const p = planFor(date);
    planHtml += `<div class="card"><h3>Plan for this day</h3>
      <div class="chips">${opts.map(([k,l])=>`<button class="chip ${(pin||'')===k?'on':''}" data-act="pin" data-d="${date}" data-v="${k}">${k?'📌 ':''}${esc(l)}</button>`).join('')}</div>
      <p class="small muted" style="margin:8px 0 0">${pin? 'Fixed: this day keeps this plan, whatever happens before it.' : 'Auto follows your split and shifts when you skip or train something else.'}</p>
      ${p && p.key && p.key!=='rest' && !mv? `<button class="big mvbtn" style="margin-top:8px" data-act="moveOpen" data-v="${date}">↔ Move this workout to a rest day</button>` : ''}</div>`;
  } else if(date<today && !list.length && unaccountedDays().includes(date)){
    planHtml += `<div class="card" style="border-color:var(--warn)"><h3>Planned training, nothing logged</h3><div class="grid3">
      <button class="no" data-act="missSkip" data-v="${date}">Skipped</button><button data-act="manualOpen" data-v="${date}">Trained</button><button class="mvbtn" data-act="moveOpen" data-v="${date}">Moved</button></div>
      <button class="link" style="font-size:12px" data-act="missRest" data-v="${date}">It was planned wrong, it was a rest day</button></div>`;
  }
  return `<div class="row between"><h2 style="margin:0">${fmtDate(date)} ${date.slice(0,4)}</h2><button class="icon" data-act="closeModal">✕</button></div>
  <div style="margin-top:12px">${planHtml}${list.map(sessionDetail).join('') || (planHtml && date>=today? '' : `<div class="empty">${isRestDay(date)?'Rest day. ':''}Nothing logged.</div>`)}</div>
  ${healthPasteBtn()}
  <button class="ghost big" data-act="manualOpen" data-v="${date}">+ Add entry for this day</button>`;
}

/* ================= STATS ================= */
function movesCardHtml(from){
  const mv = S.moves.filter(m=>m.from>=from).sort((a,b)=>a.from<b.from?1:-1);
  const done = S.sessions.filter(s=>s.date>=from && s.status==='done').length, skips = S.sessions.filter(s=>s.date>=from && s.status==='skip').length;
  if(!mv.length) return `<div class="empty small">No moved workouts in this period. Move one from Today or by tapping a day.</div>`;
  const byDay = {}; mv.forEach(m=>{ const k=DOW[parseISO(m.from).getDay()]; byDay[k]=(byDay[k]||0)+1; });
  const top = Object.entries(byDay).sort((a,b)=>b[1]-a[1])[0];
  const tight = mv.filter(m=>m.ok===false).length;
  const total = done+skips+mv.length;
  return `<div class="grid3">
      <div class="stat"><div class="v" style="color:var(--warn)">${mv.length}</div><div class="l">Moved</div></div>
      <div class="stat"><div class="v">${total? Math.round(mv.length/total*100):0}%</div><div class="l">of planned days</div></div>
      <div class="stat"><div class="v">${esc(top[0])}</div><div class="l">Most moved from (${top[1]}×)</div></div></div>
    ${tight? `<p class="small err">${tight}× moved although it made too many training days in a row.</p>` : ''}
    <table class="tbl" style="margin-top:8px">${mv.slice(0,8).map(m=>`<tr data-act="day" data-v="${m.from}"><td>${fmtDate(m.from)} → ${fmtDate(m.to)}</td><td class="small muted">${esc(keyLabel(m.key||''))}</td><td style="text-align:right">${m.ok===false?'⚠':'✓'}</td></tr>`).join('')}</table>
    <p class="small muted">Done ${done} · moved ${mv.length} · skipped ${skips}. A move keeps the routine; a skip doesn't.</p>`;
}
function rangeStart(){ if(statsRange==='all') return '0000'; return addDays(iso(), statsRange==='4w'?-28:-84); }
function allExerciseNames(){ const set=new Set(); doneSessions().forEach(s=>(s.exercises||[]).forEach(e=>{ if(e.sets.some(x=>x.done)) set.add(e.name); })); return [...set].sort(); }
function muscleProgress(from){
  // per exercise: first vs. latest top value in range (or the last value before the range if only one entry)
  const occ = {};
  doneSessions().forEach(s=>(s.exercises||[]).forEach(e=>{ if(!e.sets.some(x=>x.done)) return; (occ[e.name]=occ[e.name]||[]).push({date:s.date, v:topVal(e), e}); }));
  const rows=[];
  Object.entries(occ).forEach(([name,list])=>{
    const inR = list.filter(o=>o.date>=from); if(!inR.length) return;
    const before = list.filter(o=>o.date<from);
    const base = inR.length>1? inR[0] : before[before.length-1]; if(!base) return;
    const last = inR[inR.length-1];
    rows.push({name, muscle:last.e.muscle||defaultMuscle(name), from:base.v, to:last.v, d:last.v-base.v, unit:unitOf(last.e)});
  });
  return rows;
}
function viewStats(){
  const from = rangeStart();
  const ses = S.sessions.filter(s=>s.date>=from);
  const done = ses.filter(s=>s.status==='done'), skips = ses.filter(s=>s.status==='skip');
  const adher = done.length+skips.length? Math.round(done.length/(done.length+skips.length)*100):0;
  const vol = done.reduce((a,s)=>a+sessionVolume(s),0);
  const seg = [['4w','4 weeks'],['12w','12 weeks'],['all','All']].map(([k,l])=>`<button class="${statsRange===k?'on':''}" data-act="range" data-v="${k}">${l}</button>`).join('');
  const avg = arr => arr.length? arr.reduce((a,b)=>a+b,0)/arr.length : null;

  const mp = muscleProgress(from);
  const groups = MUSCLES.map(m=>({m, rows:mp.filter(r=>r.muscle===m)})).filter(g=>g.rows.length);
  const mpHtml = groups.map(g=>{ const up=g.rows.filter(r=>r.d>0).length;
    return `<div style="margin-top:10px"><div class="row between"><b>${esc(g.m)}</b><span class="small muted">${up}/${g.rows.length} improved</span></div>
    <table class="tbl">${g.rows.map(r=>`<tr><td>${esc(r.name)}</td><td class="small muted" style="white-space:nowrap">${fw(r.from)} → ${fw(r.to)} ${r.unit}</td><td style="text-align:right;white-space:nowrap">${deltaHtml(r.d,r.unit)}</td></tr>`).join('')}</table></div>`; }).join('');

  const byType = {}; TYPES.forEach(t=>{ const d=done.filter(s=>s.type===t && (s.exercises||[]).length); byType[t]={vol:avg(d.map(sessionVolume))||0, sets:avg(d.map(sessionSets))||0}; });
  let lostVol=0, lostSets=0, gainedMin=0; const worth=[];
  skips.forEach(s=>{ const b=byType[s.type]||{}; lostVol+=b.vol||0; lostSets+=b.sets||0; gainedMin+=num(s.skip?.minutes); if(s.skip&&s.skip.worth!=null) worth.push(s.skip.worth); });
  const worthAvg = avg(worth);
  const reasons = {}; skips.forEach(s=>{ const r=s.skip?.reason||'Other'; reasons[r]=(reasons[r]||0)+1; });
  const rs = Object.entries(reasons).sort((a,b)=>b[1]-a[1]); const rmax = rs.length? rs[0][1]:1;

  const withStretch = done.filter(s=>s.stretch); const stretched = withStretch.filter(s=>s.stretch.did);
  const ctxRow = k => { const d=done.filter(s=>s.context===k); return {c:d.length, f:avg(d.map(s=>s.post?.feeling).filter(Boolean)), v:avg(d.map(sessionVolume)), t:avg(d.filter(s=>s.end&&s.start).map(s=>s.end-s.start))}; };
  const lim=ctxRow('limited'), free=ctxRow('free');
  const stretchedIn = k => `${withStretch.filter(s=>s.context===k&&s.stretch.did).length}/${withStretch.filter(s=>s.context===k).length}`;
  const hs = done.filter(s=>s.health);
  const byEnergy = [1,2,3,4,5].map(n=>{ const d=done.filter(s=>s.pre?.energy===n && sessionVolume(s)>0); return {n, c:d.length, v:avg(d.map(sessionVolume))||0, f:avg(d.map(s=>s.post?.feeling||0))}; }).filter(x=>x.c);
  const names = allExerciseNames(); if(!statsEx || !names.includes(statsEx)) statsEx = names[0]||null;

  return `<h1>Stats</h1>
  <h2 id="month">Month overview</h2>${monthCalendarHtml()}
  <h2 style="margin-top:18px">Progress & habits</h2><div class="seg">${seg}</div>
  <div class="grid2">
    <div class="stat"><div class="v">${done.length}</div><div class="l">Workouts done</div></div>
    <div class="stat"><div class="v" style="color:${skips.length?'var(--bad)':'inherit'}">${skips.length}</div><div class="l">Skips</div></div>
    <div class="stat"><div class="v">${adher}%</div><div class="l">Adherence</div></div>
    <div class="stat"><div class="v">${withStretch.length? Math.round(stretched.length/withStretch.length*100)+'%':'—'}</div><div class="l">Stretched after workout</div></div>
  </div>
  <div class="card" style="margin-top:12px"><h2>Muscle progress</h2>
    <p class="small muted" style="margin:0">Heaviest weight (or longest hold) per exercise: first vs. latest in this period.</p>
    ${mpHtml || '<div class="empty">Train an exercise at least twice to see progress.</div>'}</div>
  <div class="card"><h2>Exercise progress</h2>
    ${names.length? `<select id="exSel">${names.map(n=>`<option ${n===statsEx?'selected':''}>${esc(n)}</option>`).join('')}</select>
    <div class="chart" id="chEx" style="margin-top:10px"></div><p class="small muted" id="exNote"></p>`:'<div class="empty">Log a workout to see progress.</div>'}</div>
  <div class="card"><h2>Done vs. skipped per week</h2>
    <div class="legend"><span><i style="background:var(--s1)"></i>Done</span><span><i style="background:var(--s2)"></i>Skipped</span></div>
    <div class="chart" id="chWeeks"></div></div>
  <div class="card"><h2>Volume per workout (kg)</h2><div class="chart" id="chVol"></div><p class="small muted">Weight × reps of completed sets. Total in this period: ${fmtNum(vol)} kg.</p></div>
  <div class="card"><h2>Moved workouts</h2>${movesCardHtml(from)}</div>
  <div class="card"><h2>Time pressure</h2>
    ${lim.c||free.c? `<table class="tbl"><tr><th></th><th>Workouts</th><th>Feeling</th><th>Volume</th><th>Duration</th></tr>
      <tr><td>⏱ Time-limited</td><td>${lim.c}</td><td>${lim.f?lim.f.toFixed(1):'—'}</td><td>${lim.v!=null?fmtNum(lim.v):'—'}</td><td>${lim.t?fmtDur(lim.t):'—'}</td></tr>
      <tr><td>🧘 No plans</td><td>${free.c}</td><td>${free.f?free.f.toFixed(1):'—'}</td><td>${free.v!=null?fmtNum(free.v):'—'}</td><td>${free.t?fmtDur(free.t):'—'}</td></tr></table>
      <p class="small muted">Stretched ${stretchedIn('limited')} times when time-limited, ${stretchedIn('free')} without plans.</p>`
      : '<div class="empty">You answer this at the end of each workout.</div>'}</div>
  <div class="card"><h2>Opportunity cost of skips</h2>
    ${skips.length?`<div class="grid2">
      <div class="stat"><div class="v">${fmtNum(lostVol)}</div><div class="l">Est. kg volume missed</div></div>
      <div class="stat"><div class="v">${Math.round(lostSets)}</div><div class="l">Est. working sets missed</div></div>
      <div class="stat"><div class="v">${gainedMin?fmtDur(gainedMin*60000):'—'}</div><div class="l">Time used elsewhere</div></div>
      <div class="stat"><div class="v">${worthAvg==null?'—':(worthAvg>0?'+':'')+worthAvg.toFixed(1)}</div><div class="l">"Worth it?" average (−2…+2)</div></div>
    </div>
    <h3 style="margin-top:14px">Skip reasons</h3><table class="tbl">${rs.map(([r,n])=>`<tr><td style="width:38%">${esc(r)}</td><td><div class="hbar" style="width:${n/rmax*100}%"></div></td><td style="width:30px;text-align:right">${n}</td></tr>`).join('')}</table>
    <p class="small ink2">${worthAvg!=null && worthAvg<0?'On average, your skips were <b>not worth it</b>. Next time, consider a short 30-minute version instead.':worthAvg!=null && worthAvg>0?'Most skips felt justified. Recovery before the calendar is fine.':''}</p>`
    :'<div class="empty">No skips in this period 👏</div>'}
    <p class="small muted">Missed volume and sets are estimated from your average session of the same type.</p></div>
  <div class="card"><h2>Feeling and performance</h2>
    <div class="chart" id="chFeel"></div><p class="small muted" style="margin-top:4px">Feeling after workout (1–5)</p>
    ${byEnergy.length?`<h3 style="margin-top:12px">Energy before vs. outcome</h3><table class="tbl"><tr><th>Energy</th><th>Sessions</th><th>Avg volume</th><th>Avg feeling</th></tr>${byEnergy.map(x=>`<tr><td>${x.n}/5</td><td>${x.c}</td><td>${fmtNum(x.v)} kg</td><td>${x.f?x.f.toFixed(1):'—'}</td></tr>`).join('')}</table>`:''}</div>
  ${hs.length?`<div class="card"><h2>Apple Health (avg per workout)</h2><div class="grid3">
    <div class="stat"><div class="v">${Math.round(avg(hs.map(s=>s.health.steps)))}</div><div class="l">Steps</div></div>
    <div class="stat"><div class="v">${Math.round(avg(hs.map(s=>s.health.kcal)))}</div><div class="l">Active kcal</div></div>
    <div class="stat"><div class="v">${Math.round(avg(hs.map(s=>s.health.hrAvg).filter(Boolean))||0)||'—'}</div><div class="l">Avg heart rate</div></div></div></div>`:''}
  <div class="card"><h2>Bodyweight (kg)</h2><div class="chart" id="chBW"></div></div>`;
}

/* ---- tiny SVG chart engine (single axis, hover/tap tooltips) ---- */
function chartFrame(el){ el.innerHTML=''; const tip=document.createElement('div'); tip.className='tip'; el.appendChild(tip); return tip; }
function lineChart(el, pts, opt={}){
  if(!el) return;
  if(pts.length<1){ el.innerHTML='<div class="empty small">Not enough data yet.</div>'; return; }
  const W=340,H=170,L=34,R=10,T=10,B=22;
  const ys=pts.map(p=>p.y); let lo=Math.min(...ys), hi=Math.max(...ys);
  if(opt.zero) lo=0; if(opt.fixed){ lo=opt.fixed[0]; hi=opt.fixed[1]; }
  if(hi===lo){ hi+=1; lo=Math.max(0,lo-1); }
  const padv=(hi-lo)*0.1; if(!opt.fixed){ hi+=padv; if(!opt.zero) lo-=padv; }
  const x=i=> L+(pts.length===1?(W-L-R)/2:i*(W-L-R)/(pts.length-1));
  const y=v=> T+(H-T-B)*(1-(v-lo)/(hi-lo));
  let g=''; for(let k=0;k<=3;k++){ const v=lo+(hi-lo)*k/3; g+=`<line x1="${L}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L-4}" y="${y(v)+3}" text-anchor="end">${fmtNum(v)}</text>`; }
  const path=pts.map((p,i)=>`${i?'L':'M'}${x(i).toFixed(1)},${y(p.y).toFixed(1)}`).join('');
  const lbls=[0,Math.floor((pts.length-1)/2),pts.length-1].filter((v,i,a)=>a.indexOf(v)===i).map(i=>`<text x="${x(i)}" y="${H-6}" text-anchor="${i===0?'start':i===pts.length-1?'end':'middle'}">${esc(pts[i].lx)}</text>`).join('');
  const dots=pts.map((p,i)=>`<circle cx="${x(i)}" cy="${y(p.y)}" r="${pts.length>40?2.5:4}" fill="var(--s1)" stroke="var(--card)" stroke-width="2"/>`).join('');
  const tip=chartFrame(el);
  el.insertAdjacentHTML('beforeend',`<svg viewBox="0 0 ${W} ${H}"><g class="grid">${g}</g><path d="${path}" fill="none" stroke="var(--s1)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>${dots}${lbls}<line class="cross" x1="0" x2="0" y1="${T}" y2="${H-B}" stroke="var(--muted)" stroke-dasharray="3 3" style="display:none"/><rect x="${L}" y="0" width="${W-L-R}" height="${H}" fill="transparent"/></svg>`);
  const svg=el.querySelector('svg'), cross=svg.querySelector('.cross');
  const move=ev=>{ const r=svg.getBoundingClientRect(); const cx=((ev.touches?ev.touches[0].clientX:ev.clientX)-r.left)/r.width*W;
    let best=0,bd=1e9; pts.forEach((p,i)=>{ const d=Math.abs(x(i)-cx); if(d<bd){bd=d;best=i;} });
    const p=pts[best]; cross.setAttribute('x1',x(best)); cross.setAttribute('x2',x(best)); cross.style.display='';
    tip.style.display='block'; tip.style.left=(x(best)/W*100)+'%'; tip.style.top=(y(p.y)/H*100)+'%'; tip.textContent=p.tip||`${p.lx}: ${fmtNum(p.y)}`; };
  const hide=()=>{ tip.style.display='none'; cross.style.display='none'; };
  svg.addEventListener('pointermove',move); svg.addEventListener('pointerdown',move); svg.addEventListener('touchmove',move,{passive:true}); svg.addEventListener('pointerleave',hide);
}
function groupedBars(el, groups){
  if(!el) return;
  if(!groups.length){ el.innerHTML='<div class="empty small">Not enough data yet.</div>'; return; }
  const W=340,H=150,L=24,R=6,T=8,B=22;
  const mx=Math.max(1,...groups.map(g=>Math.max(g.a,g.b)));
  const step=mx<=5?1:2, hi=Math.max(4,Math.ceil(mx/step)*step);
  const gw=(W-L-R)/groups.length, bw=Math.max(3,Math.min(14,(gw-6)/2));
  const y=v=>T+(H-T-B)*(1-v/hi);
  let grid=''; for(let v=0;v<=hi;v+=step) grid+=`<line x1="${L}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L-4}" y="${y(v)+3}" text-anchor="end">${v}</text>`;
  const bar=(x,v,c)=>{ if(!v) return ''; const r=Math.min(4,bw/2,y(0)-y(v)); return `<path d="M${x},${y(0)} V${y(v)+r} q0,-${r} ${r},-${r} h${bw-2*r} q${r},0 ${r},${r} V${y(0)} Z" fill="${c}"/>`; };
  let bars='', lbl='';
  groups.forEach((g,i)=>{ const cx=L+gw*i+gw/2; bars+=bar(cx-bw-1,g.a,'var(--s1)')+bar(cx+1,g.b,'var(--s2)')+`<rect x="${L+gw*i}" y="0" width="${gw}" height="${H}" fill="transparent" data-i="${i}"/>`;
    if(groups.length<=8 || i%Math.ceil(groups.length/6)===0) lbl+=`<text x="${cx}" y="${H-6}" text-anchor="middle">${esc(g.lx)}</text>`; });
  const tip=chartFrame(el);
  el.insertAdjacentHTML('beforeend',`<svg viewBox="0 0 ${W} ${H}"><g class="grid">${grid}</g>${bars}${lbl}</svg>`);
  const svg=el.querySelector('svg');
  svg.querySelectorAll('rect[data-i]').forEach(r=>{ const show=()=>{ const i=+r.dataset.i,g=groups[i]; tip.style.display='block'; tip.style.left=((L+gw*i+gw/2)/W*100)+'%'; tip.style.top=(y(Math.max(g.a,g.b))/H*100)+'%'; tip.textContent=`Week of ${g.lx}: ${g.a} done, ${g.b} skipped`; };
    r.addEventListener('pointerenter',show); r.addEventListener('pointerdown',show); });
  svg.addEventListener('pointerleave',()=>tip.style.display='none');
}
function mountCharts(){
  const from=rangeStart();
  const ses=sortSessions(S.sessions.filter(s=>s.date>=from));
  const weeks={}; ses.forEach(s=>{ const m=mondayOf(s.date); weeks[m]=weeks[m]||{a:0,b:0}; if(s.status==='done') weeks[m].a++; else weeks[m].b++; });
  if(ses.length){ let m=mondayOf(ses[0].date); const end=mondayOf(iso()); while(m<=end){ weeks[m]=weeks[m]||{a:0,b:0}; m=addDays(m,7);} }
  groupedBars($('#chWeeks'), Object.keys(weeks).sort().map(k=>{ const d=parseISO(k); return {lx:`${d.getDate()}.${d.getMonth()+1}`, ...weeks[k]}; }));
  const dl = s=>{ const d=parseISO(s.date); return `${d.getDate()}.${d.getMonth()+1}`; };
  lineChart($('#chVol'), ses.filter(s=>s.status==='done' && sessionVolume(s)>0).map(s=>({lx:dl(s), y:sessionVolume(s), tip:`${fmtDate(s.date)} ${s.type}: ${fmtNum(sessionVolume(s))} kg`})), {zero:true});
  lineChart($('#chFeel'), ses.filter(s=>s.status==='done' && s.post?.feeling).map(s=>({lx:dl(s), y:s.post.feeling, tip:`${fmtDate(s.date)} ${s.type}: feeling ${s.post.feeling}/5`})), {fixed:[1,5]});
  lineChart($('#chBW'), S.bodyweight.filter(b=>b.date>=from).sort((a,b)=>a.date<b.date?-1:1).map(b=>({lx:`${parseISO(b.date).getDate()}.${parseISO(b.date).getMonth()+1}`, y:b.kg, tip:`${fmtDate(b.date)}: ${fw(b.kg)} kg`})));
  if(statsEx){
    const pts=[]; let kind='w';
    ses.filter(s=>s.status==='done').forEach(s=>{ const e=(s.exercises||[]).find(x=>x.name===statsEx); if(!e||!e.sets.some(x=>x.done)) return; kind=e.kind;
      const v = hasWeight(e)? Math.max(...e.sets.filter(x=>x.done).map(x=>e1rm(e,x))) : topVal(e);
      if(v>0) pts.push({lx:dl(s), y:v, tip:`${fmtDate(s.date)}: ${fmtNum(v)} ${unitOf(e)} · ${e.sets.filter(x=>x.done).map(x=>setLabel(e,x)).join(', ')}`}); });
    lineChart($('#chEx'), pts);
    const note=$('#exNote');
    if(note){ const metric = kind==='time'?'Longest hold (sec)':kind==='dur'?'Duration (min)':'Estimated 1RM (kg, Epley formula)';
      const ch = pts.length>1? ((pts[pts.length-1].y/pts[0].y-1)*100):null;
      note.textContent = metric + (ch!=null? ` · ${ch>=0?'+':''}${ch.toFixed(1)}% since first entry in range`:''); }
  }
}

/* ================= SETTINGS ================= */
let tplEdit='Push';
function viewSettings(){
  const st=S.settings, tpl=S.templates[tplEdit];
  const tabs=WORKOUTS.map(w=>`<button class="${tplEdit===w.key?'on':''}" data-act="tplTab" data-v="${w.key}">${w.key==='PullBoulder'?'Boulder':w.label}</button>`).join('');
  const rows=tpl.exercises.map((e,i)=>`<div class="list-item" style="display:block">
    <div class="row"><input data-tpl="name" data-i="${i}" value="${esc(e.name)}"><button class="icon" data-act="tplUp" data-i="${i}">↑</button><button class="icon" data-act="tplDel" data-i="${i}" style="color:var(--bad)">✕</button></div>
    <div class="row" style="margin-top:6px">
      <select data-tpl="kind" data-i="${i}" style="flex:1.4">${Object.entries(KINDS).map(([k,l])=>`<option value="${k}" ${e.kind===k?'selected':''}>${l}</option>`).join('')}</select>
      <select data-tpl="muscle" data-i="${i}" style="flex:1">${MUSCLES.map(m=>`<option ${e.muscle===m?'selected':''}>${m}</option>`).join('')}</select></div>
    <div class="row" style="margin-top:6px">
      <span class="small muted">Sets</span><input data-tpl="sets" data-i="${i}" value="${e.sets}" inputmode="numeric">
      <span class="small muted">Target</span><input data-tpl="target" data-i="${i}" value="${esc(e.target)}">
      <span class="small muted">Rest</span><input data-tpl="rest" data-i="${i}" value="${e.rest}" inputmode="numeric">
    </div></div>`).join('');
  return `<h1>Settings</h1>
  <div class="card"><h2>Profile</h2>
    <label class="f">Name (stored on this device only)</label><input data-prof="name" value="${esc(S.profile.name)}">
    <button class="link" data-act="obRestart">Run the welcome wizard again</button></div>
  <div class="card"><h2>Training plan</h2>
    <label class="f">Split (repeats on your training days)</label>
    <div class="chips">${SPLIT_PRESETS.map(p=>`<button class="chip ${p.order.join()===st.rotation.join()?'on':''}" data-act="splitPreset" data-v="${p.order.join(',')}">${esc(p.label)}</button>`).join('')}
      <span class="chip ${SPLIT_PRESETS.some(p=>p.order.join()===st.rotation.join())?'':'on'}" style="opacity:.8">Custom</span></div>
    <div style="margin-top:8px">${st.rotation.map((t,i)=>`<div class="row" style="margin-top:6px"><span class="small muted" style="width:18px">${i+1}.</span>
      <select data-rot="${i}">${TYPES.map(x=>`<option ${x===t?'selected':''}>${x}</option>`).join('')}</select>
      <button class="icon" data-act="rotUp" data-i="${i}">↑</button>${st.rotation.length>1?`<button class="icon" data-act="rotDel" data-i="${i}" style="color:var(--bad)">✕</button>`:''}</div>`).join('')}
      <button class="small ghost" style="margin-top:8px" data-act="rotAdd">+ Add day to split</button></div>
    <p class="small ink2">${st.rotation.map(esc).join(' → ')} → ${esc(st.rotation[0])} → …</p>
    <label class="f">Training days</label>
    <div class="chips">${[1,2,3,4,5,6,0].map(d=>`<button class="chip ${!st.restDays.includes(d)?'on':''}" data-act="restDay" data-v="${d}">${DOW[d]}</button>`).join('')}</div>
    <label class="f">Max training days in a row (for moving workouts)</label>
    <div class="chips"><button class="chip ${!st.maxInRow?'on':''}" data-act="maxRow" data-v="0">Auto (${weeklyMaxRun()}, from your week)</button>${[2,3,4,5,6].map(n=>`<button class="chip ${st.maxInRow===n?'on':''}" data-act="maxRow" data-v="${n}">${n}</button>`).join('')}</div>
    <label class="f">Every 2nd Pull day with bouldering</label>
    <div class="chips"><button class="chip ${st.boulderEvery2nd?'on':''}" data-act="boulder2" data-v="1">On</button><button class="chip ${!st.boulderEvery2nd?'on':''}" data-act="boulder2" data-v="0">Off</button></div>
    <label class="f">When a workout is skipped</label>
    <div class="chips"><button class="chip ${!st.skipAdvances?'on':''}" data-act="skipAdv" data-v="0">It moves to the next training day (default)</button><button class="chip ${st.skipAdvances?'on':''}" data-act="skipAdv" data-v="1">It's dropped, rotation moves on</button></div>
    <label class="f">Next workout in the rotation</label>
    <div class="chips"><button class="chip ${!st.nextOverride?'on':''}" data-act="override" data-v="">Automatic</button>${TYPES.filter(t=>st.rotation.includes(t)).map(t=>`<button class="chip ${st.nextOverride===t?'on':''}" data-act="override" data-v="${t}">${t}</button>`).join('')}</div>
    <p class="small muted">Fixed days: ${Object.keys(S.planPins).filter(d=>d>=iso()).length}. Fix single days by tapping them in the week view or calendar.
      ${Object.keys(S.planPins).some(d=>d>=iso())?'<button class="link" data-act="clearPins">Clear all upcoming fixed days</button>':''}</p>
  </div>
  <div class="card"><h2>General</h2>
    <label class="f">Weight step for +/− buttons (kg)</label><input data-set="step" inputmode="decimal" value="${fw(st.step)}">
    <label class="f">Rest-timer sound</label>
    <div class="chips"><button class="chip ${st.sound?'on':''}" data-act="sound" data-v="1">On</button><button class="chip ${!st.sound?'on':''}" data-act="sound" data-v="0">Off</button></div>
    <label class="f">Theme</label>
    <div class="chips">${['auto','light','dark'].map(t=>`<button class="chip ${st.theme===t?'on':''}" data-act="theme" data-v="${t}">${t[0].toUpperCase()+t.slice(1)}</button>`).join('')}</div>
  </div>
  <div class="card"><h2>Workout templates</h2>
    <div class="seg">${tabs}</div>
    <h3>Warm-up</h3>
    <textarea data-wu="text">${esc(tpl.warmup.text)}</textarea>
    <div class="row" style="margin-top:6px"><span class="small muted">Planned minutes</span><input data-wu="minutes" inputmode="numeric" value="${tpl.warmup.minutes||0}" style="width:80px"></div>
    <h3 style="margin-top:14px">Exercises</h3>
    ${rows}
    <button class="ghost big" style="margin-top:10px" data-act="tplAdd">+ Add exercise</button>
    <button class="ghost big" style="margin-top:8px" data-act="tplReset">Reset this template to default</button>
  </div>
  <div class="card"><h2>iCloud Drive backup</h2>
    <p class="small ink2">Saves <b>data.json</b> (all workouts, skips, bodyweight, templates, settings and your name) to <b>iCloud Drive/Gym</b>. Last sync: <b>${st.icloudLast? new Date(st.icloudLast).toLocaleString('de-CH',{dateStyle:'short',timeStyle:'short'}) : 'never'}</b>${icloudDirty()?' · <span style="color:var(--warn)">unsaved changes</span>':''}</p>
    <button class="primary big" data-act="icloudSave">Save to iCloud Drive now</button>
    <button class="big" style="margin-top:8px" data-act="importBtn">Restore from data.json</button>
    <label class="f">Automatic backup after each workout, skip and bodyweight entry</label>
    <div class="chips"><button class="chip ${st.icloudAuto?'on':''}" data-act="icloudAuto" data-v="1">On (default)</button><button class="chip ${!st.icloudAuto?'on':''}" data-act="icloudAuto" data-v="0">Off</button></div>
    <label class="f">Shortcut name</label><input data-set="icloudShortcut" value="${esc(st.icloudShortcut)}">
    <details style="margin-top:12px"><summary class="small" style="font-weight:600">One-time setup: create the Shortcut</summary>${shortcutSaveSteps()}</details>
    <h3 style="margin-top:14px">Check that the backup works</h3>${backupCheckHtml()}
  </div>
  <div class="card"><h2>Apple Health</h2>
    <p class="small ink2">Gets steps, active calories and heart rate for the exact workout time from Apple Health, using a Shortcut. Wear your Apple Watch, ideally with its Workout app running.</p>
    <label class="f">Shortcut name</label><input data-set="healthShortcut" value="${esc(st.healthShortcut)}">
    <details style="margin-top:12px"><summary class="small" style="font-weight:600">One-time setup: create the Shortcut</summary>
      <ol class="small ink2">
        <li>Shortcuts → <b>+</b>, name it <b>${esc(st.healthShortcut||'Gym Health')}</b>. The app sends text like <code>2026-01-31 16:00:00|2026-01-31 17:10:00</code>.</li>
        <li><b>Split Text</b> (Shortcut Input) by <i>Custom</i> <code>|</code></li>
        <li><b>Get Item from List</b> → First Item → <b>Get Dates from Input</b> → <b>Set Variable</b> <code>Start</code></li>
        <li><b>Get Item from List</b> (Split Text) → Last Item → <b>Get Dates from Input</b> → <b>Set Variable</b> <code>End</code></li>
        <li><b>Find Health Samples</b>: Type <i>Steps</i>, Start Date is between <code>Start</code> and <code>End</code> → <b>Calculate Statistics</b> Sum → <b>Set Variable</b> <code>Steps</code></li>
        <li>Same for <i>Active Energy</i> → Sum → <code>Kcal</code></li>
        <li>Same for <i>Heart Rate</i> → Average → <code>HRavg</code>, and Maximum → <code>HRmax</code></li>
        <li><b>Dictionary</b> with keys <code>steps</code>, <code>kcal</code>, <code>hrAvg</code>, <code>hrMax</code> = those variables → <b>Copy to Clipboard</b></li>
        <li>Back in the app, tap <b>Paste Apple Health result</b>. Allow Health access on the first run.</li>
      </ol></details>
  </div>
  <div class="card"><h2>App version</h2>${versionHtml()}</div>
  <div class="card"><h2>Data</h2>
    <div class="grid2"><button data-act="export">Export backup</button><button data-act="importBtn">Import backup</button></div>
    <button class="danger big" style="margin-top:10px" data-act="wipe">Delete all data</button>
    <p class="small muted">${S.sessions.length} entries · ${S.bodyweight.length} bodyweight logs · stored on this device only</p>
  </div>`;
}

/* ---- app version (provided by the loader in index.html) ---- */
function versionHtml(){
  const L = window.GymLoader;
  if(!L) return '<p class="small muted">Running from local files (development).</p>';
  const when = L.loadedAt? new Date(L.loadedAt).toLocaleString('de-CH',{dateStyle:'short',timeStyle:'short'}) : '—';
  return `<p class="small ink2">Version <code>${esc((L.sha||'').slice(0,7)||'—')}</code> · downloaded ${when}<br>
    The app checks for a newer version on every start. It keeps working offline with the last downloaded version.</p>
    ${L.pinned? '<p class="small" style="color:var(--warn)">Updates are paused: you went back to an older version.</p><button class="primary big" data-act="updUnpin">Resume updates</button>'
      : L.updateReady? '<button class="primary big" data-act="updApply">New version ready: restart app</button>' : '<button class="big" data-act="updCheck">Check for updates</button>'}
    ${L.hasPrevious && !L.pinned? '<button class="link" data-act="updRollback">Go back to the previous version</button>' : ''}`;
}
// Shown by the loader when a newer version was downloaded in the background
function onUpdateReady(){ toast('New version available'); if(!$('#modal').innerHTML) render(); }
const updateBanner = () => window.GymLoader && GymLoader.updateReady && S.profile.onboarded
  ? `<div class="card row between" style="border-color:var(--accent);background:var(--accent-soft)"><div class="small"><b>New version available</b><br><span class="muted">Your data stays as it is.${S.active?' Your workout continues after the refresh.':''}</span></div><button class="primary" data-act="updApply">⟳ Refresh</button></div>` : '';

/* ================= modal ================= */
function openModal(html){ $('#modal').innerHTML=`<div class="modal" data-act="modalBg"><div class="sheet">${html}</div></div>`; }
function closeModal(){ $('#modal').innerHTML=''; dayOpen=null; }
function restSheet(){ const e=curStep(); return `<h2>Rest timer: ${esc(e.name)}</h2><label class="f">Seconds</label><input id="exRest" inputmode="numeric" value="${e.rest}">
  <button class="primary big" style="margin-top:12px" data-act="restSave">Done</button>`; }

/* ================= events ================= */
document.addEventListener('click', ev=>{
  unlockAudio();
  const t=ev.target.closest('[data-act]'); if(!t || t.disabled) return;
  const a=t.dataset.act, v=t.dataset.v, W=S.active;
  if(a==='modalBg'){ if(ev.target===t) closeModal(); return; }
  switch(a){
    case 'tab': go(v); break;
    // welcome wizard
    case 'obNext': obNext(); break;
    case 'obBack': S.profile.obStep=Math.max(0,(S.profile.obStep||0)-1); save(false); render(); break;
    case 'obRestart': S.profile.onboarded=false; S.profile.obStep=0; save(false); render(); break;
    case 'bkTest': backupTest(); break;
    case 'bkVerify': $('#verifyFile').click(); break;
    // today
    case 'startOpen': if(S.active){ go('workout'); break; } openModal(startSheet()); break;
    case 'startGo': startWorkout($('#stKey').value, +$('#stAgo').value); break;
    case 'skipOpen': { const tp=todayPlan(); skipDraft=newDraft(tp.key && tp.key!=='rest'? {type:keyType(tp.key)} : {}); openModal(skipSheet()); break; }
    case 'missSkip': skipDraft=newDraft({mode:'skip', showMode:true, date:v}); openModal(skipSheet()); break;
    case 'manualOpen': skipDraft=newDraft({mode:'done', showMode:true, date:v||iso()}); openModal(skipSheet()); break;
    case 'entMode': readSkipInputs(); skipDraft.mode=v; openModal(skipSheet()); break;
    case 'moveOpen': skipDraft=newDraft({mode:'move', showMode:v<iso(), date:v, key:plannedKeyOn(v)}); openModal(skipSheet()); break;
    case 'mvPick': readSkipInputs(); skipDraft.moveTo=v; openModal(skipSheet()); break;
    case 'mvSave': { readSkipInputs(); const d=skipDraft, c=moveCandidates(d.date).find(x=>x.date===d.moveTo); if(!c) break;
      const key = plannedKeyOn(d.date);
      S.planPins[d.date]='rest'; S.planPins[c.date]='train';
      S.moves.push({id:uid(), from:d.date, to:c.date, key, run:c.run, ok:c.ok, at:Date.now()});
      if(c.date<=iso()){ const w=WORKOUTS.find(x=>x.key===d.key)||WORKOUTS[0]; S.sessions.push({id:uid(), date:c.date, type:w.type, boulder:w.boulder, status:'done', exercises:[], notes:'Moved from '+fmtDate(d.date)}); }
      save(); closeModal(); render(); toast(`Moved ${fmtDate(d.date)} → ${fmtDate(c.date)}`);
      if(S.settings.icloudAuto) saveToICloud(); break; }
    case 'undoMove': if(confirm('Undo this move? Both days go back to the normal plan.')){ undoMove(v); save(); closeModal(); render(); } break;
    case 'entSave': { readSkipInputs(); const w=WORKOUTS.find(x=>x.key===skipDraft.key)||WORKOUTS[0];
      S.sessions.push({id:uid(), date:skipDraft.date, type:w.type, boulder:w.boulder, status:'done', exercises:[], notes:skipDraft.note});
      save(); closeModal(); render(); toast(`${w.label} added for ${fmtDate(skipDraft.date)}`);
      if(S.settings.icloudAuto) saveToICloud(); break; }
    case 'missRest': S.planPins[v]='rest'; save(); closeModal(); render(); break;
    case 'pin': { const d=t.dataset.d; if(v) S.planPins[d]=v; else delete S.planPins[d]; save(); openModal(daySheet(d)); dayOpen=d; render(); break; }
    case 'skReason': readSkipInputs(); skipDraft.reason=v; openModal(skipSheet()); break;
    case 'skWorth': readSkipInputs(); skipDraft.worth=+v; openModal(skipSheet()); break;
    case 'skSave': readSkipInputs(); if(!skipDraft.reason){ toast('Pick a reason'); break; }
      S.sessions.push({id:uid(), date:skipDraft.date, type:skipDraft.type, status:'skip', skip:{reason:skipDraft.reason, instead:skipDraft.instead, minutes:skipDraft.minutes, worth:skipDraft.worth, note:skipDraft.note}});
      // a skip doesn't use up the workout: it moves to the next training day (unless skips are set to move the rotation on)
      if(S.settings.skipAdvances) S.settings.nextOverride=null;
      save(); closeModal(); render(); toast(`Skip logged. Official count: ${skipStats().total}`);
      if(S.settings.icloudAuto) saveToICloud(); break;
    case 'closeModal': closeModal(); break;
    case 'bwSave': { const k=num($('#bwIn').value); if(!k){ toast('Enter a weight'); break;} upsertBW(iso(),k); save(); render(); toast('Bodyweight saved'); if(S.settings.icloudAuto) saveToICloud(); break; }
    // workout wizard
    case 'pre': W.pre=W.pre||{}; W.pre[t.dataset.k]=+v; save(); t.parentElement.querySelectorAll('.chip').forEach(c=>c.classList.toggle('on',c===t)); break;
    case 'post': W.post=W.post||{}; W.post[t.dataset.k]=+v; save(); t.parentElement.querySelectorAll('.chip').forEach(c=>c.classList.toggle('on',c===t)); break;
    case 'stepW': case 'stepR': {
      const e=curStep(), si=+t.dataset.s, s=e.sets[si], k = a==='stepW'?'w':'r';
      const old = num(s[k]); const nv = Math.max(0, Math.round((old + (+v)*(k==='w'?(S.settings.step||0.25):1))*100)/100);
      s[k] = k==='w'? nv : String(nv);
      // carry the change to the following sets that had the same value and aren't ticked yet
      e.sets.slice(si+1).forEach(x=>{ if(!x.done && num(x[k])===old) x[k]=s[k]; });
      save(); render(); break; }
    case 'setDone': { const e=curStep(), s=e.sets[+t.dataset.s]; s.done=!s.done; if(s.done) startTimer(e.rest); save(); render(); break; }
    case 'addSet': { const e=curStep(); const l=e.sets[e.sets.length-1]; e.sets.push({w:l?l.w:'', r:l?l.r:'', done:false}); save(); render(); break; }
    case 'rmSet': curStep().sets.pop(); save(); render(); break;
    case 'restEdit': openModal(restSheet()); break;
    case 'restSave': curStep().rest=Math.max(0,parseInt($('#exRest').value)||0); save(); closeModal(); render(); break;
    case 'next': advance(Date.now()); break;
    case 'skipEx': { const c=curStep(); c.skipped=true; c.sets.forEach(s=>s.done=false); c.end=Date.now();
      if(W.idx < W.exercises.length-1){ W.idx++; curStep().start=c.end; } else { W.end=c.end; W.stage='stretch'; }
      W.timer=null; save(); window.scrollTo(0,0); render(); break; }
    case 'agoOpen': openModal(agoSheet(v)); break;
    case 'finishOpen': openModal(agoSheet('finish')); break;
    case 'endEarlyOpen': openModal(agoSheet('end')); break;
    case 'agoPick': { const ts = Date.now() - (+v)*60000, k=t.dataset.k;
      if(k==='end') endEarly(ts);
      else if(k==='stretch'){ W.stretch.end=Math.max(W.stretch.start+1000, Math.min(Date.now(),ts)); W.stage='context'; save(); closeModal(); render(); }
      else advance(ts); break; }
    case 'back': goBack(); break;
    case 'stretchYes': W.stretch={did:true, start:Date.now(), end:null}; W.stage='stretching'; save(); render(); break;
    case 'stretchNo': W.stretch={did:false}; W.stage='context'; save(); render(); break;
    case 'stretchDone': W.stretch.end=Date.now(); W.stage='context'; save(); render(); break;
    case 'ctx': W.context=v; W.stage='final'; save(); window.scrollTo(0,0); render(); break;
    case 'saveWorkout': saveWorkout(); break;
    case 'discard': if(confirm('Discard this workout? Nothing will be saved.')){ S.active=null; save(); go('today'); } break;
    case 'tAdj': if(W&&W.timer){ W.timer.end+=(+v)*1000; W.timer.total=Math.max(1,W.timer.total+(+v)); W.timer.fired=Date.now()>=W.timer.end; save(false); renderTimer(); } break;
    case 'tStop': if(W){ W.timer=null; save(false); } renderTimer(); break;
    // health
    case 'healthActive': requestHealth('active', W.start, W.end||Date.now()); break;
    case 'healthSes': { const s=S.sessions.find(x=>x.id===t.dataset.id); if(s) requestHealth(s.id, s.start, s.end); break; }
    case 'healthPaste': pasteHealth(); break;
    // history
    case 'day': dayOpen=v; openModal(daySheet(v)); break;
    case 'monthView': calMonth = iso().slice(0,7); go('stats'); break;
    case 'calNav': { const [y,m]=calMonth.split('-').map(Number); const d=new Date(y,m-1+(+v),1); calMonth=`${d.getFullYear()}-${pad(d.getMonth()+1)}`; render(); break; }
    case 'histF': histFilter=v; render(); break;
    case 'delSes': if(confirm('Delete this entry?')){ S.sessions=S.sessions.filter(s=>s.id!==t.dataset.id); save(); const d=dayOpen; closeModal(); render(); if(d){ dayOpen=d; openModal(daySheet(d)); } } break;
    // stats & settings
    case 'range': statsRange=v; render(); break;
    case 'override': S.settings.nextOverride=v||null; save(); render(); break;
    case 'restDay': { const d=+v, r=S.settings.restDays; S.settings.restDays = r.includes(d)? r.filter(x=>x!==d) : [...r,d]; save(); render(); break; }
    case 'skipAdv': S.settings.skipAdvances = v==='1'; save(); render(); break;
    case 'maxRow': S.settings.maxInRow = +v; save(); render(); break;
    case 'boulder2': S.settings.boulderEvery2nd = v==='1'; save(); render(); break;
    case 'splitPreset': S.settings.rotation = v.split(','); S.settings.nextOverride=null; save(); render(); toast('Split: '+S.settings.rotation.join(' → ')); break;
    case 'rotUp': { const i=+t.dataset.i, r=S.settings.rotation; if(i>0){ [r[i-1],r[i]]=[r[i],r[i-1]]; save(); render(); } break; }
    case 'rotDel': if(S.settings.rotation.length>1){ S.settings.rotation.splice(+t.dataset.i,1); save(); render(); } break;
    case 'rotAdd': S.settings.rotation.push(TYPES.find(x=>!S.settings.rotation.includes(x))||'Push'); save(); render(); break;
    case 'clearPins': if(confirm('Remove all upcoming fixed days? They go back to automatic.')){ Object.keys(S.planPins).forEach(d=>{ if(d>=iso()) delete S.planPins[d]; }); save(); render(); } break;
    case 'sound': S.settings.sound = v==='1'; save(); render(); break;
    case 'theme': S.settings.theme=v; save(); render(); break;
    case 'tplTab': tplEdit=v; render(); break;
    case 'tplAdd': S.templates[tplEdit].exercises.push(ex('New exercise','w',3,'8-12',S.settings.defaultRest,'Other')); save(); render(); break;
    case 'tplDel': S.templates[tplEdit].exercises.splice(+t.dataset.i,1); save(); render(); break;
    case 'tplUp': { const i=+t.dataset.i, l=S.templates[tplEdit].exercises; if(i>0){ [l[i-1],l[i]]=[l[i],l[i-1]]; save(); render(); } break; }
    case 'tplReset': if(confirm('Reset this template (warm-up and exercises)?')){ S.templates[tplEdit]=JSON.parse(JSON.stringify(DEFAULT_TEMPLATES[tplEdit])); save(); render(); } break;
    case 'export': exportData(); break;
    case 'icloudSave': saveToICloud(); break;
    case 'icloudAuto': S.settings.icloudAuto = v==='1'; save(false); render(); break;
    case 'importBtn': $('#importFile').click(); break;
    case 'updCheck': if(window.GymLoader) GymLoader.checkNow(true); break;
    case 'updApply': location.reload(); break;
    case 'updUnpin': if(window.GymLoader) GymLoader.unpin(); break;
    case 'updRollback': if(window.GymLoader && confirm('Go back to the previous app version? Your data is not affected.')) GymLoader.rollback(); break;
    case 'wipe': if(confirm('Delete ALL data? Export a backup first.') && confirm('Really delete everything?')){ localStorage.removeItem(KEY); localStorage.removeItem(LEGACY_KEY); S=defaultState(); save(); go('today'); } break;
  }
});
document.addEventListener('input', ev=>{
  const t=ev.target, W=S.active;
  if(t.dataset.in && W){ const e=curStep(), si=+t.dataset.s, k=t.dataset.in, old=e.sets[si][k];
    e.sets[si][k]=t.value;
    e.sets.slice(si+1).forEach((x,j)=>{ if(!x.done && String(x[k])===String(old)){ x[k]=t.value; const inp=document.querySelector(`[data-in="${k}"][data-s="${si+1+j}"]`); if(inp) inp.value=t.value; } });
    save(); }
  else if(t.dataset.pre && W){ W.pre=W.pre||{}; W.pre[t.dataset.pre]=t.value; save(); }
  else if(t.dataset.post && W){ W.post=W.post||{}; W.post[t.dataset.post]=t.value; save(); }
  else if(t.hasAttribute('data-notes') && W){ W.notes=t.value; save(); }
  else if(t.dataset.prof){ S.profile[t.dataset.prof]=t.value; save(); }
  else if(t.dataset.set){ S.settings[t.dataset.set] = t.dataset.set==='step'? (num(t.value)||0.25) : t.value; save(false); }
  else if(t.dataset.wu){ const w=S.templates[tplEdit].warmup; w[t.dataset.wu] = t.dataset.wu==='minutes'? (parseInt(t.value)||0) : t.value; save(); }
  else if(t.dataset.tpl){ const e=S.templates[tplEdit].exercises[+t.dataset.i]; const k=t.dataset.tpl; e[k]=(k==='sets'||k==='rest')? (parseInt(t.value)||0) : t.value; save(); }
});
document.addEventListener('change', ev=>{
  const t=ev.target;
  if(t.id==='exSel'){ statsEx=t.value; render(); }
  if(t.dataset.rot!=null){ S.settings.rotation[+t.dataset.rot]=t.value; S.settings.nextOverride=null; save(); render(); }
  if(t.dataset.tpl==='kind' || t.dataset.tpl==='muscle'){ S.templates[tplEdit].exercises[+t.dataset.i][t.dataset.tpl]=t.value; save(); }
  if((t.id==='importFile' || t.id==='verifyFile') && t.files[0]){
    const r=new FileReader();
    r.onload=()=>{
      if(t.id==='verifyFile'){ verifyBackupFile(r.result); return; }
      try{ const d=JSON.parse(r.result); if(!d.v||!Array.isArray(d.sessions)) throw new Error('Not a backup file');
        if(confirm(`Restore ${d.sessions.length} entries from this backup? This replaces the data on this device.`)){
          S=migrate(d); if(S.profile.name) S.profile.onboarded=true; save(); go('today'); toast('Backup restored'); } }
      catch(e){ toast('Import failed: '+e.message); } };
    r.readAsText(t.files[0]); t.value=''; }
});
async function exportData(){
  const json=JSON.stringify(S,null,1), name=`gym-backup-${iso()}.json`;
  const file=new File([json],name,{type:'application/json'});
  if(navigator.canShare && navigator.canShare({files:[file]})){ try{ await navigator.share({files:[file], title:name}); return; }catch(e){ if(e.name==='AbortError') return; } }
  const a=document.createElement('a'); a.href=URL.createObjectURL(file); a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),2000);
}
// Coming back from the Shortcuts app: reload state from storage and refresh (unless a sheet is open)
document.addEventListener('visibilitychange',()=>{ if(!document.hidden){ S = load(); if(!$('#modal').innerHTML) render(); else tick(); } });

render();
window.__gymBooted = true; // tells the loader this version started fine
if(window.GymLoader && GymLoader.justUpdated) setTimeout(()=>toast('Updated to the latest version ✓'), 300);

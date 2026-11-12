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
const KINDS = {w:'Weight × reps', bw:'Bodyweight exercise (total kg) × reps', reps:'Reps only', time:'Hold (sec)', dur:'Duration (min)'};
const MUSCLES = ['Chest','Shoulders','Triceps','Back','Biceps','Forearms / Grip','Quads','Hamstrings','Glutes','Calves','Core','Full body','Other'];
const SKIP_REASONS = ['No time','Work','Tired','Sick','Alcohol','Social','Pain / injury','Motivation','Other'];
const AGO = [1,2,3,5,10,15,20,30,45,60];

const ex = (name, kind, sets, target, rest, muscle) => ({name, kind, sets, target, rest, muscle, info:'', warm: kind==='w'? 1 : 0});
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
    v:5,
    profile:{ name:'', onboarded:false, obStep:0 },
    settings:{ rotation:[...TYPES], restDays:[4,0], skipAdvances:false, boulderEvery2nd:true, planStart:localToday(), maxInRow:0,
      defaultRest:60, wipSave:15, sound:true, nextOverride:null, theme:'auto',
      step:0.25, progStep:1, keepAwake:true, icloudAuto:true, icloudShortcut:'Gym Save', icloudLast:0, healthShortcut:'Gym Health',
      backupToken:null, backupVerified:0 },
    templates: JSON.parse(JSON.stringify(DEFAULT_TEMPLATES)), tplHistory: {},
    planPins: {}, moves: [],
    sessions: [], bodyweight: [], active: null, healthPending: null, lastChange: 0,
  };
}
function load(){
  for(const k of [KEY, LEGACY_KEY]){
    try{ const s = JSON.parse(localStorage.getItem(k)); if(s && s.v) return migrate(s); }catch(e){}
  }
  return migrate(defaultState()); // fills in template versions for a fresh install
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
  if(s.v < 4){
    if(s.settings.defaultRest===120) s.settings.defaultRest = 60; // 120 was the old default; the new default rest is 60 s
    const a = s.active;
    if(a && a.view===undefined){ // in-progress workout from the previous version → set flow
      a.key = a.boulder? 'PullBoulder' : a.type; a.view = Math.max(0, a.idx); a.moving = null; a.lastSnap = Date.now(); delete a.timer;
      if(a.idx>=0) a.warmup.end = a.warmup.end || a.exercises[0].start || a.start;
      a.exercises.forEach((e,i)=>{ e.tplName=e.name; e.info=e.info||''; e.arrived = i<=a.idx? (e.start||a.start) : null; e.left = i<a.idx? (e.end||e.start||a.start) : null;
        e.sets.forEach(x=>{ x.warm=false; x.pressed=false; x.est=true; if(i<a.idx && x.done){ x.start=x.end=e.left; } else { x.start=x.end=null; x.done=false; } }); });
    }
  }
  // template versions: every change is a new version; the full list (with snapshots) stays in tplHistory
  s.tplHistory = s.tplHistory || {};
  for(const k of Object.keys(s.templates)){
    const t=s.templates[k]; t.v = t.v || 1;
    t.exercises.forEach(e=>{ if(e.info==null) e.info=''; if(e.warm==null) e.warm=0; });
    if(!(s.tplHistory[k]||[]).length) s.tplHistory[k] = [{v:t.v, at:Date.now(), note:'Version before changes were tracked', tpl:JSON.parse(JSON.stringify(t))}];
  }
  if(s.v < 5){
    // every weight exercise gets one warm-up set by default; saved as a new template version so the old one stays
    for(const k of Object.keys(s.templates)){
      const t=s.templates[k];
      if(!t.exercises.some(e=>e.kind==='w' && !(e.warm>0))) continue;
      const n=JSON.parse(JSON.stringify(t)); n.exercises.forEach(e=>{ if(e.kind==='w' && !(e.warm>0)) e.warm=1; }); n.v=t.v+1;
      s.tplHistory[k].push({v:n.v, at:Date.now(), note:'One warm-up set added to each weight exercise', tpl:JSON.parse(JSON.stringify(n))});
      s.templates[k]=n;
    }
  }
  s.v = 5;
  return s;
}
// Warm-up weight: 30–50 % of the working weight, picked so the difference stacks with big plates
// (100 → 50, 80 → 40, 22.5 → 10, 17.5 → 7.5). The largest such value wins; coarser steps are tried first.
function warmWeight(w){
  w=num(w); if(w<=0) return 0;
  let best=0;
  for(const st of [25,20,10,5,2.5]){ const c=Math.floor(w*0.5/st)*st; if(c>=w*0.3 && c>best) best=c; }
  return best || Math.round(w*0.4*4)/4;
}
// Saves a new template version. The previous one stays in tplHistory, so nothing is ever overwritten.
// During a workout of that template the changes collect in a temporary copy (a.tplDraft) and become ONE new version
// when the workout ends (tplCommit, on save or discard).
function tplChange(key, note, fn){
  const a = S.active;
  if(a && a.key===key){
    a.tplDraft = a.tplDraft || JSON.parse(JSON.stringify(S.templates[key])); fn(a.tplDraft);
    (a.tplNotes = a.tplNotes||[]).push(note); return;
  }
  tplNewVersion(key, note, fn);
}
function tplNewVersion(key, note, fn){
  const t = JSON.parse(JSON.stringify(S.templates[key])); fn(t);
  t.v = (S.templates[key].v||1) + 1;
  (S.tplHistory[key] = S.tplHistory[key]||[]).push({v:t.v, at:Date.now(), note, tpl:JSON.parse(JSON.stringify(t))});
  S.templates[key] = t;
}
function tplCommit(){
  const a = S.active; if(!a || !a.tplDraft) return null;
  const d = a.tplDraft, notes = a.tplNotes||[]; delete a.tplDraft; delete a.tplNotes;
  const note = notes.length>2? `${notes.slice(0,2).join(', ')} +${notes.length-2} more` : notes.join(', ');
  tplNewVersion(a.key, note || 'Changed during a workout', t=>{ t.warmup=d.warmup; t.exercises=d.exercises; });
  a.tplV = S.templates[a.key].v;
  return a.tplV;
}
const tplPendingNote = () => { const a=S.active; return a && a.tplDraft? `${keyLabel(a.key)} v${(S.templates[a.key].v||1)+1} is saved when the workout ends` : ''; };
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
// Every save carries a fresh marker (backupToken). "Check backup" reads data.json back and compares it with the app.
const backupJson = () => JSON.stringify(S, null, 1); // includes a workout in progress, so a backup taken mid-workout keeps it
function saveToICloud(){
  S.settings.backupToken = uid(); S.settings.backupSavedAt = Date.now(); S.settings.icloudLast = Date.now(); save(false);
  const json = backupJson();
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(json).then(()=>{
    runShortcut(S.settings.icloudShortcut||'Gym Save','clipboard');
  }, e=>toast('Clipboard blocked: '+e.message));
  else toast('Clipboard not available. Use Export backup instead.');
}
const icloudDirty = () => (S.lastChange||0) > (S.settings.icloudLast||0);
const backupUnchecked = () => S.settings.backupToken && S.settings.backupCheckedToken !== S.settings.backupToken;
function backupTest(){ saveToICloud(); }
// Compare a backup file with the data in the app: newest save? every entry, move, bodyweight, fixed day included?
function compareBackup(d){
  const res=[]; const okAll = [];
  const add = (ok, text) => { res.push({ok, text}); okAll.push(ok); };
  const st=d.settings||{};
  add(st.backupToken && st.backupToken===S.settings.backupToken,
    st.backupToken===S.settings.backupToken? `Newest save (${new Date(S.settings.backupSavedAt||Date.now()).toLocaleString('de-CH',{dateStyle:'short',timeStyle:'short'})})` : 'This is an older save, not the newest one');
  const ids = new Set((d.sessions||[]).map(s=>s.id));
  const missing = S.sessions.filter(s=>!ids.has(s.id));
  const last = sortSessions(S.sessions).pop();
  add(!missing.length, missing.length? `${missing.length} entr${missing.length>1?'ies are':'y is'} missing: ${missing.slice(0,3).map(s=>fmtDate(s.date)+' '+s.type+(s.status==='skip'?' (skip)':'')).join(', ')}${missing.length>3?' …':''}`
    : `All ${S.sessions.length} workouts and skips included${last?` (latest: ${fmtDate(last.date)} ${last.type}${last.status==='skip'?' skip':''})`:''}`);
  const mIds = new Set((d.moves||[]).map(m=>m.id)), mMiss = S.moves.filter(m=>!mIds.has(m.id)).length;
  add(!mMiss, mMiss? `${mMiss} moved workout(s) missing` : `All ${S.moves.length} moved workouts included`);
  const bwMiss = S.bodyweight.filter(b=>!(d.bodyweight||[]).some(x=>x.date===b.date && x.kg===b.kg)).length;
  add(!bwMiss, bwMiss? `${bwMiss} bodyweight entr${bwMiss>1?'ies':'y'} missing` : `All ${S.bodyweight.length} bodyweight entries included`);
  const pinsOk = JSON.stringify(d.planPins||{})===JSON.stringify(S.planPins);
  add(pinsOk, pinsOk? 'Training plan and fixed days included' : 'Training plan differs from the app');
  const newer = (S.lastChange||0) > (st.backupSavedAt||st.icloudLast||0) + 2000;
  if(newer) add(false, 'You changed something after this save → save again');
  return {res, ok: okAll.every(Boolean)};
}
function verifyBackupFile(text){
  let d; try{ d = JSON.parse(text); }catch(e){ toast('This is not a Gym backup file'); return; }
  if(!d.v || !Array.isArray(d.sessions)){ toast('This is not a Gym backup file'); return; }
  const r = compareBackup(d);
  if(r.ok){ S.settings.backupVerified = Date.now(); S.settings.backupCheckedToken = S.settings.backupToken; save(false); }
  render();
  openModal(`<h2>${r.ok? '<span class="ok">✓ Backup is complete and up to date</span>' : '<span class="err">⚠ Backup is not up to date</span>'}</h2>
    <table class="tbl">${r.res.map(x=>`<tr><td style="width:24px">${x.ok?'✅':'⚠️'}</td><td class="small">${esc(x.text)}</td></tr>`).join('')}</table>
    ${r.ok? '<p class="small ink2">Your data is safe in iCloud Drive.</p>' : '<button class="primary big" style="margin-top:12px" data-act="icloudSave">Save to iCloud again</button><p class="small muted">Then check again and pick the new data.json.</p>'}
    <button class="big" style="margin-top:10px" data-act="closeModal">Close</button>`);
}
function backupCheckHtml(){
  const st=S.settings;
  const status = !st.backupToken? '<span class="err">no backup saved yet</span>'
    : backupUnchecked()? `<span style="color:var(--warn)">saved ${new Date(st.backupSavedAt||st.icloudLast).toLocaleString('de-CH',{dateStyle:'short',timeStyle:'short'})}, not checked yet</span>`
    : `<span class="ok">✓ checked, complete (${new Date(st.backupVerified).toLocaleString('de-CH',{dateStyle:'short',timeStyle:'short'})})</span>`;
  return `<div class="small" style="margin:6px 0 10px">Status: ${status}${icloudDirty()&&st.backupToken?' · <span style="color:var(--warn)">changes since then</span>':''}</div>
  <button class="primary big" data-act="bkTest">1. Save backup now</button>
  <button class="big" style="margin-top:8px" data-act="bkVerify" ${st.backupToken?'':'disabled'}>2. ✓ Check backup (pick Gym/data.json)</button>`;
}
// Plain copy of all data, e.g. to paste into a note in the Notes app (and restore from there).
function copyAllData(){
  if(!(navigator.clipboard && navigator.clipboard.writeText)){ toast('Clipboard not available'); return; }
  navigator.clipboard.writeText(backupJson()).then(()=>toast(`All data copied (${S.sessions.length} entries). Paste it into a note.`), e=>toast('Copy failed: '+e.message));
}
async function restoreFromClipboard(){
  try{
    const d = JSON.parse(await navigator.clipboard.readText());
    if(!d.v || !Array.isArray(d.sessions)) throw new Error('the clipboard does not contain Gym data');
    if(confirm(`Restore ${d.sessions.length} entries from the clipboard? This replaces the data on this device.`)){ S=migrate(d); if(S.profile.name) S.profile.onboarded=true; save(); go('today'); toast('Data restored'); }
  }catch(e){ toast('Restore failed: '+e.message); }
}
// Settings → Workout templates → "Paste a template": the clipboard text becomes a new version of the selected template.
async function tplPaste(){
  try{
    const d = JSON.parse(await navigator.clipboard.readText());
    const list = Array.isArray(d)? d : d.exercises;
    if(!Array.isArray(list) || !list.length || !list.every(e=>e && e.name)) throw new Error('no "exercises" list with names found');
    const exs = list.map(e=>({ name:String(e.name).trim(), info:String(e.info||''), kind: KINDS[e.kind]? e.kind : 'w',
      sets:Math.max(1, parseInt(e.sets)||3), target:String(e.target||'8-12'), rest: e.rest!=null && e.rest!==''? Math.max(0, parseInt(e.rest)||0) : S.settings.defaultRest,
      muscle: MUSCLES.includes(e.muscle)? e.muscle : defaultMuscle(e.name), warm: e.warm!=null && e.warm!==''? Math.max(0, parseInt(e.warm)||0) : (KINDS[e.kind]&&e.kind!=='w'? 0 : 1), w: num(e.w)||0 }));
    const cur = S.templates[tplEdit];
    if(!confirm(`Make this the new ${keyLabel(tplEdit)} template (${exs.length} exercises)? v${cur.v||1} stays in the version list.`)) return;
    tplChange(tplEdit, 'Pasted', t=>{ t.exercises=exs; if(d.warmup && d.warmup.text!=null) t.warmup={text:String(d.warmup.text), minutes:parseInt(d.warmup.minutes)||0}; });
    save(); render(); toast(`${keyLabel(tplEdit)} v${S.templates[tplEdit].v} is in use now`);
  }catch(e){ toast('Paste failed: '+e.message); }
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
// Accepts JSON ({"steps":…}) or plain text like "steps=4321 kcal=250 hrAvg=120 hrMax=165" (one per line, : or = ),
// or just four numbers in that order. Numbers may have units, ' or ’ as thousands separator and a decimal comma.
function parseHealth(txt){
  txt = String(txt||'').trim();
  if(!txt) throw new Error('the clipboard is empty');
  const clean = v => { let t=String(v??'').replace(/[’'\s]/g,'');
    t = t.includes('.') || /,\d{3}(?!\d)/.test(t)? t.replace(/,/g,'') : t.replace(',','.'); // 1,234 / 1,234.5 → thousands; 250,5 → decimal
    const n=parseFloat(t.replace(/[^0-9.\-]/g,'')); return isFinite(n)? n : 0; };
  let d=null; try{ d=JSON.parse(txt); }catch(e){}
  const out={};
  const put=(k,v)=>{ k=String(k).toLowerCase().replace(/[^a-z]/g,'');
    const key = /step/.test(k)? 'steps' : /kcal|cal|energy/.test(k)? 'kcal' : /max/.test(k)? 'hrMax' : /avg|average|hr|heart/.test(k)? 'hrAvg' : null;
    if(key) out[key]=clean(v); };
  if(d && typeof d==='object' && !Array.isArray(d)) Object.entries(d).forEach(([k,v])=>put(k,v));
  else {
    // key = the word right before : or = (units like "count" in front of it are ignored)
    const re=/([A-Za-z]+)\s*[:=]\s*([\d’',.]*\d)/g; let m, any=false;
    while((m=re.exec(txt))){ put(m[1], m[2]); any=true; }
    if(!any){ const nums=txt.split(/[\n|;]+/).map(clean); ['steps','kcal','hrAvg','hrMax'].forEach((k,i)=>{ if(nums[i]!=null) out[k]=nums[i]; }); }
  }
  if(!Object.keys(out).length) throw new Error('no steps / kcal / heart rate found in “'+txt.slice(0,40)+'”');
  return {steps:Math.round(out.steps||0), kcal:Math.round(out.kcal||0), hrAvg:Math.round(out.hrAvg||0), hrMax:Math.round(out.hrMax||0)};
}
function applyHealth(txt){
  const h = parseHealth(txt);
  const tgt = S.healthPending && S.healthPending.target;
  if(tgt==='active' && S.active) S.active.health = h;
  else { const s=S.sessions.find(x=>x.id===tgt); if(!s) throw new Error('no workout is waiting for health data'); s.health=h; }
  const d=dayOpen; S.healthPending = null; save(); closeModal(); render(); if(d){ dayOpen=d; openModal(daySheet(d)); } toast(`Health data added: ${h.steps} steps, ${h.kcal} kcal`);
}
async function pasteHealth(){
  let txt='';
  try{ txt = await navigator.clipboard.readText(); }catch(e){}
  try{ applyHealth(txt); }
  catch(e){ // e.g. the Shortcut copied a Dictionary (not text): let the user paste by hand
    openModal(`<h2>Paste Apple Health result</h2><p class="small ink2">Could not read it automatically (${esc(e.message)}). Long-press the box below → <b>Paste</b>, then tap Add.</p>
      <textarea class="auto" rows="3" id="hlTxt" placeholder="steps=4321&#10;kcal=250&#10;hrAvg=120&#10;hrMax=165"></textarea>
      <p class="small muted">Tip: in the Shortcut, put a <b>Text</b> action before <b>Copy to Clipboard</b> (see Settings → Apple Health).</p>
      <div class="grid2" style="margin-top:10px"><button class="big" data-act="closeModal">Cancel</button><button class="primary big" data-act="healthManual">Add</button></div>`);
  }
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
const DOWL = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const fmtDate = s => { const d=parseISO(s); return `${DOW[d.getDay()]} ${d.getDate()}.${d.getMonth()+1}.`; };
const fmtDur = ms => { const m=Math.max(0,Math.round(ms/60000)); return m>=60? `${Math.floor(m/60)}h ${m%60}m` : `${m}m`; };
const fmtClock = ms => { const s=Math.max(0,Math.floor(ms/1000)); const h=Math.floor(s/3600); return h? `${h}:${pad(Math.floor(s/60)%60)}:${pad(s%60)}` : `${Math.floor(s/60)}:${pad(s%60)}`; };
const fmtTime = ts => { const d=new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const fmtNum = n => n>=10000? (n/1000).toFixed(1)+'k' : n>=100? Math.round(n).toLocaleString('de-CH') : (Math.round(n*10)/10).toLocaleString('de-CH');
const fw = n => String(Math.round(num(n)*100)/100);
const sortSessions = arr => arr.slice().sort((a,b)=> a.date===b.date ? (a.start||0)-(b.start||0) : a.date<b.date?-1:1);
const hasWeight = e => e.kind==='w' || e.kind==='bw';
const unitOf = e => e.kind==='time'?'s':e.kind==='dur'?'min':e.kind==='reps'?'reps':'kg';

function latestBW(beforeDate){
  const list = S.bodyweight.filter(b=>!beforeDate || b.date<=beforeDate).sort((a,b)=>a.date<b.date?-1:1);
  return list.length? list[list.length-1].kg : 0;
}
function setLoad(e, s){ return hasWeight(e)? num(s.w)*num(s.r) : 0; }
function e1rm(e, s){ const r=num(s.r), w=num(s.w); if(!r||!w||!hasWeight(e)) return 0; return r===1? w : w*(1+Math.min(r,15)/30); }
function sessionVolume(ses){ let v=0; (ses.exercises||[]).forEach(e=>e.sets.forEach(s=>{ if(s.done) v+=setLoad(e,s); })); return v; }
function sessionSets(ses){ let n=0; (ses.exercises||[]).forEach(e=>e.sets.forEach(s=>{ if(s.done) n++; })); return n; }
function doneSessions(){ return sortSessions(S.sessions.filter(s=>s.status==='done')); }
// "Other activity" entries (golf, swimming …) are logged like a workout but never count for the training plan
const isGym = s => !s.activity;
const gymOn = d => S.sessions.filter(s=>s.date===d && isGym(s));
// "Top" value of an exercise in a session: heaviest weight (or longest hold / duration)
function topVal(e){ const d=e.sets.filter(s=>s.done); if(!d.length) return 0; return hasWeight(e)? Math.max(...d.map(s=>num(s.w))) : Math.max(...d.map(s=>num(s.r))); }
function setLabel(e, s){
  if(e.kind==='time') return `${s.r}s`;
  if(e.kind==='dur') return `${s.r} min`;
  if(e.kind==='reps') return `${s.r||'?'} reps`;
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
    const pool = sortSessions(S.sessions.filter(s=> isGym(s) && (s.status==='done' || (S.settings.skipAdvances && s.status==='skip'))));
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
    const d = addDays(today,i), logged = gymOn(d), pin = S.planPins[d];
    if(logged.length){ out.push({date:d, key:null, pinned:!!pin, logged}); continue; }
    // pin 'train' = training day created by a move (workout follows the rotation); 'rest' = rest day; else a fixed workout
    const key = pin==='train'? takeNext(st) : pin || (isRestDay(d)? 'rest' : takeNext(st));
    if(key!=='rest') consume(st, key);
    out.push({date:d, key, pinned:!!pin && pin!=='train', moved:pin==='train', logged});
  }
  return out;
}

/* ---- moving a workout ----
   Move day F → day T (up to 3 days before/after): F becomes a rest day, T becomes a training day that simply gets
   the next workout of the rotation (a fixed 📌 workout on F travels along). If T already was a training day,
   the following days shift by one. Nothing is logged for T unless T is already in the past.
   Every move is kept in S.moves (with the previous pins, so Undo restores exactly). A manual plan change
   on F or T replaces the move. Too many training days in a row only warns, it never blocks. */
function setTrainingIn(pins, d, on){
  const p=pins[d], def=!isRestDay(d);
  if(on){ if(p && p!=='rest') return; if(def) delete pins[d]; else pins[d]='train'; }
  else { if(def) pins[d]='rest'; else delete pins[d]; }
}
function applyMoveTo(pins, from, to){
  const fixed = pins[from] && pins[from]!=='rest' && pins[from]!=='train'? pins[from] : null;
  setTrainingIn(pins, from, false); setTrainingIn(pins, to, true);
  if(fixed) pins[to]=fixed;
}
function weeklyMaxRun(){ // longest run of training days in the weekly schedule (wraps around the week)
  const train=[0,1,2,3,4,5,6].map(i=>!S.settings.restDays.includes(i)); if(train.every(Boolean)) return 7;
  let best=0, run=0; for(let i=0;i<14;i++){ if(train[i%7]){ run++; best=Math.max(best,run); } else run=0; } return best;
}
const maxInRow = () => S.settings.maxInRow || weeklyMaxRun();
function trainingOn(d, pins){ if(gymOn(d).some(s=>s.status==='done')) return true; const p=pins[d]; return p? p!=='rest' : !isRestDay(d); }
// length of the run of consecutive training days that contains day d
function runAt(d, pins){
  if(!trainingOn(d,pins)) return 0;
  let n=1; for(let x=addDays(d,-1); trainingOn(x,pins) && n<30; x=addDays(x,-1)) n++;
  for(let x=addDays(d,1); trainingOn(x,pins) && n<30; x=addDays(x,1)) n++;
  return n;
}
function moveCheck(from, to){
  const pins = Object.assign({}, S.planPins); applyMoveTo(pins, from, to);
  const run = runAt(to, pins);
  return {run, ok: run<=maxInRow(), wasTraining: trainingOn(to, S.planPins)};
}
function moveCandidates(from){
  const out=[];
  for(const off of [-3,-2,-1,1,2,3]){ const d=addDays(from,off);
    if(gymOn(d).length) continue;                           // already logged
    if(S.moves.some(m=>m.from===d)) continue;               // freed by another move
    out.push(Object.assign({date:d}, moveCheck(from,d))); }
  return out;
}
function plannedKeyOn(d){ const p=planFor(d); return p && p.key && p.key!=='rest'? p.key : nextPlan().key; }
function doMove(from, to){
  const prev = {from: S.planPins[from]??null, to: S.planPins[to]??null};
  const c = moveCheck(from, to), key = plannedKeyOn(from);
  applyMoveTo(S.planPins, from, to);
  const m = {id:uid(), from, to, key, run:c.run, ok:c.ok, prev, at:Date.now()};
  S.moves.push(m); return m;
}
function undoMove(id){
  const m=S.moves.find(x=>x.id===id); if(!m) return;
  const restore = (d,v) => { if(v==null) delete S.planPins[d]; else S.planPins[d]=v; };
  if(m.prev){ restore(m.from, m.prev.from); restore(m.to, m.prev.to); }
  else { if(S.planPins[m.from]==='rest') delete S.planPins[m.from]; if(S.planPins[m.to]==='train') delete S.planPins[m.to]; }
  S.moves=S.moves.filter(x=>x.id!==id);
}
// upcoming runs of training days longer than the limit (shown as a warning on Today)
function longRuns(days){
  const out=[]; let start=null, len=0;
  const end = addDays(iso(), days);
  for(let d=addDays(iso(),-3); d<=end; d=addDays(d,1)){
    if(trainingOn(d, S.planPins)){ if(!len) start=d; len++; }
    else { if(len>maxInRow() && addDays(start,len-1)>=iso()) out.push({start, end:addDays(start,len-1), len}); len=0; }
  }
  if(len>maxInRow()) out.push({start, end:addDays(start,len-1), len});
  return out;
}
function planFor(d){ const n=daysBetween(iso(),d); return n<0? null : planDays(n+1)[n]; }
function autoKeyFor(d){ const p=S.planPins[d]; delete S.planPins[d]; const r=planFor(d); if(p) S.planPins[d]=p; return r? r.key : null; }
function nextPlan(){ const k = takeNext(rotationState()); return {type:keyType(k), boulder:k==='PullBoulder', key:k}; }
function todayPlan(){ return planDays(1)[0]; }
function nextTraining(){ return planDays(21).slice(1).find(p=>p.key && p.key!=='rest'); }
function isRestDay(dateISO){ return S.settings.restDays.includes(parseISO(dateISO).getDay()); }
// Past planned training days without any entry: the plan must not silently hide skips.
// Tracking starts at the first thing ever logged (entry or move) or the setup day, whichever is earlier.
function firstTrackedDay(){
  const ds=[S.settings.planStart, ...S.sessions.map(s=>s.date), ...S.moves.map(m=>m.from), ...S.moves.map(m=>m.to)].filter(Boolean).sort();
  return ds[0] || iso();
}
function unaccountedDays(){
  const out=[], today=iso(), start=firstTrackedDay();
  for(let i=120;i>=1;i--){ const d=addDays(today,-i); if(d<start || gymOn(d).length) continue;
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
  // no navigation while a workout runs: the workout is the only screen until it is saved or discarded
  const off = !S.profile.onboarded || !!S.active;
  document.body.classList.toggle('notabs', off);
  if(off){ $('#tabs').innerHTML=''; return; }
  const tabs = [['today','Today'],...(S.active?[['workout','Workout']]:[]),['history','History'],['stats','Stats'],['settings','Settings']];
  $('#tabs').innerHTML = tabs.map(([k,l])=>`<button data-act="tab" data-v="${k}" class="${VIEW===k?'on':''}">${ICONS[k]}${l}</button>`).join('');
}
function render(){
  if(S.active) VIEW='workout';
  else if(VIEW==='workout') VIEW='today';
  applyTheme(); renderTabs(); wakeSync();
  if(!S.profile.onboarded){ $('#app').innerHTML = viewOnboarding(); renderTimer(); return; }
  $('#app').innerHTML = updateBanner() + ({today:viewToday, workout:viewWorkout, history:viewHistory, stats:viewStats, settings:viewSettings}[VIEW]||viewToday)();
  if (VIEW==='stats') mountCharts();
  renderTimer(); tick(); growAll($('#app'));
  if (VIEW==='workout') afterWorkoutRender();
}
function go(v){ VIEW=v; window.scrollTo(0,0); render(); }
// Keep the screen on while a workout runs (Screen Wake Lock API, iOS 16.4+; in Home Screen apps reliable from iOS 18.4)
let wakeLock=null, wakeBusy=false;
function wakeSync(){
  const want = !!(S.active && S.settings.keepAwake && !document.hidden && navigator.wakeLock);
  if(want && !wakeLock && !wakeBusy){ wakeBusy=true;
    navigator.wakeLock.request('screen').then(l=>{ wakeLock=l; l.addEventListener('release',()=>{ wakeLock=null; }); }).catch(()=>{}).finally(()=>{ wakeBusy=false; }); }
  else if(!want && wakeLock){ wakeLock.release().catch(()=>{}); wakeLock=null; }
}
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
      <p class="small ink2" style="margin:6px 0 0">Tap 1: the Shortcut saves a backup. Come back here and tap 2, then pick <b>iCloud Drive → Gym → data.json</b>. The app reads it back and checks that it's the newest save and that every entry is in it. You can do this check after any save.</p>
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
function dayMarks(list){ return list.map(s=> s.activity? '<span class="muted">○</span>' : s.status==='done'?`<span class="t-${s.type}">●</span>`:'<span style="color:var(--bad)">✕</span>').join(''); }
// Marker for one day: logged entries, the planned workout (future), or a "?" for a past training day without entry
function dayCell(d, planMap, missing){
  const list=S.sessions.filter(s=>s.date===d), gym=list.filter(isGym), act=list.filter(s=>s.activity);
  if(gym.length) return dayMarks(list);
  if(act.length && (d<iso() || !planMap[d] || !planMap[d].key || planMap[d].key==='rest')) return dayMarks(act);
  if(S.moves.some(m=>m.from===d)) return '<span class="mv">↔</span>';
  const p=planMap[d];
  if(p && p.key) return p.key==='rest'? `<span class="muted">${p.pinned?'📌':''}–</span>` : `<span class="plan t-${keyType(p.key)}">${p.pinned?'📌':p.moved?'↔':''}${keyShort(p.key)}</span>`;
  if(missing.includes(d)) return '<span class="logme">log</span>';
  return isRestDay(d)?'<span class="muted">–</span>':'<span class="muted">·</span>';
}
// One calendar cell (Today's 2-week view and the month view). Upcoming planned training days get a dashed outline.
function calCell(ds, planMap, missing, showMonth){
  const today=iso(), list=gymOn(ds), movedFrom=S.moves.some(m=>m.from===ds), p=planMap[ds];
  let cls = list.some(s=>s.status==='done')? 'cd' : list.length? 'cs' : movedFrom? 'cm' : '';
  if(!list.length && !movedFrom && ds>=today && p && p.key && p.key!=='rest') cls += ' up';
  if(missing.includes(ds)) cls += ' tolog';
  const cell = (ds<today && !S.sessions.some(s=>s.date===ds) && !missing.includes(ds) && !movedFrom)? '' : dayCell(ds, planMap, missing);
  const dd=parseISO(ds), label = showMonth && dd.getDate()===1? `${dd.getDate()}.${dd.getMonth()+1}.` : dd.getDate();
  return `<div class="c ${cls} ${ds===today?'today':''}" data-act="day" data-v="${ds}"><div>${label}</div><div class="st">${cell}</div></div>`;
}
const CAL_HEAD = ['Mo','Tu','We','Th','Fr','Sa','Su'].map(d=>`<div class="h">${d}</div>`).join('');
const CAL_LEGEND = `<div class="legend" style="margin:8px 0 0"><span><i style="background:var(--good-soft)"></i>Trained</span><span><i style="background:color-mix(in srgb,var(--bad) 22%,var(--card2))"></i>Skipped</span><span><i style="background:color-mix(in srgb,var(--warn) 25%,var(--card2))"></i>Moved</span><span><i style="border:1.5px dashed var(--muted)"></i>Planned</span><span><i style="border:1.5px dashed var(--bad)"></i>To log</span><span>📌 fixed</span></div>`;
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
  if(missing.length && !S.active) banner += `<div class="card" style="border-color:var(--bad);border-style:dashed"><b style="color:var(--bad)">${missing.length} day${missing.length>1?'s':''} to log</b>
    <p class="small ink2" style="margin:4px 0 6px">Planned training without an entry. Skips are never hidden: what happened?${missing.length>4?' Showing the oldest 4; the rest are marked red dashed in the calendar.':''}</p>
    ${missing.slice(0,4).map(d=>`<div class="row between wrap" style="padding:6px 0;border-top:1px solid var(--line)"><span class="small"><b>${fmtDate(d)}</b></span>
      <span class="row"><button class="small no" data-act="missSkip" data-v="${d}">Skipped</button><button class="small" data-act="manualOpen" data-v="${d}">Trained</button><button class="small mvbtn" data-act="moveOpen" data-v="${d}">Moved</button></span></div>`).join('')}
    <button class="link" style="font-size:12px" data-act="missRest" data-v="${missing[0]}">${fmtDate(missing[0])} was planned wrong, it was a rest day</button></div>`;
  if(!S.active && !S.settings.backupToken) banner += `<div class="card row between" style="border-color:var(--warn)"><div class="small"><b>No iCloud backup yet</b><br><span class="muted">Make sure your data is safe.</span></div><button class="primary" data-act="tab" data-v="settings">Set up</button></div>`;
  else if(!S.active && !icloudDirty() && backupUnchecked()) banner += `<div class="card row between" style="border-color:var(--accent)"><div class="small"><b>Backup saved ${fmtTime(S.settings.backupSavedAt||S.settings.icloudLast)}</b><br><span class="muted">Check that it arrived complete in iCloud.</span></div><button class="primary" data-act="bkVerify">✓ Check</button></div>`;
  else if(!S.active && icloudDirty()) banner += `<div class="card row between" style="border-color:var(--warn)">
    <div class="small"><b>Not saved to iCloud</b><br><span class="muted">${ago==null?'Never synced yet':'Last sync '+(ago===0?'today':ago+' day(s) ago')}</span></div>
    <button class="primary" data-act="icloudSave">Save</button></div>`;
  let main;
  if (S.active) {
    main = `<div class="card"><h2>Workout in progress</h2><p class="ink2">${esc(woLabel(S.active))} · started ${fmtTime(S.active.start)}</p><button class="primary big" data-act="tab" data-v="workout">Continue workout</button></div>`;
  } else {
    const doneToday = S.sessions.find(s=>s.date===today && s.status==='done' && isGym(s));
    const acts = S.sessions.filter(s=>s.date===today && s.activity);
    const actLine = acts.length? `<p class="small ink2" style="margin:8px 0 0">Today also: ${acts.map(s=>esc(s.activity)+(s.start&&s.end?' '+fmtDur(s.end-s.start):'')).join(', ')}</p>` : '';
    if(doneToday){
      // trained today: the big title is the NEXT workout, with its day, so it never reads like "Push today"
      const nx = nextTraining(), nk = nx? nx.key : nextPlan().key, inDays = nx? daysBetween(today, nx.date) : null;
      const nd = nx? parseISO(nx.date) : null;
      const when = inDays===1? 'Tomorrow' : nd? `On ${DOWL[nd.getDay()]}, ${nd.getDate()}.${nd.getMonth()+1}.` : '';
      main = `<div class="card">
        <div class="small" style="color:var(--good);font-weight:600">✓ Trained today: ${esc(woLabel(doneToday))}${doneToday.start&&doneToday.end?' · '+fmtDur(doneToday.end-doneToday.start):''}</div>
        <div class="muted small" style="margin-top:12px">Next workout</div>
        <div class="hero t-${keyType(nk)}">${esc(keyLabel(nk))}</div>
        ${when?`<div class="ink2 small" style="margin-top:2px">${when}</div>`:''}${actLine}
        <button class="link" style="margin-top:8px" data-act="startOpen">+ Another workout or activity (golf, swimming …)</button>
      </div>`;
    } else main = `<div class="card">
      <div class="row between"><span class="muted small">${rest?'Today: rest day':'Today’s plan'}</span>${tp.pinned?'<span class="pill">📌 fixed</span>':''}</div>
      ${rest? `<div class="hero">Rest</div><p class="small ink2" style="margin:4px 0 0">Recovery comes before the calendar.${nt?` Next: <b>${esc(keyLabel(nt.key))}</b> on ${fmtDate(nt.date)}.`:''} You can still train today if you want to.</p>`
      : `<div class="hero t-${plan.type}">${esc(plan.type)}${plan.boulder?' + Boulder':''}</div>
      ${plan.type==='Pull' && S.settings.boulderEvery2nd?`<p class="small ink2" style="margin:4px 0 0">${plan.boulder?'Every 2nd Pull day: bouldering first, then pull-ups, rows, biceps and shrugs.':'Regular gym Pull day. The next Pull day is a bouldering day.'}</p>`:''}`}
      ${actLine}
      <div class="grid2" style="margin-top:12px">
        <button class="primary big" data-act="startOpen">Start workout</button>
        <button class="big danger" data-act="skipOpen">Log skip</button>
      </div>
      ${!rest? '<button class="link" data-act="moveOpen" data-v="'+today+'">↔ Move today’s workout to a rest day</button>' : ''}
    </div>`;
  }
  const runs = longRuns(13);
  return `<h1>${greeting()}${S.profile.name?', '+esc(S.profile.name):''}</h1>${banner}${healthPasteBtn()}${main}
  <div class="card">
    <div class="row between" style="margin-bottom:8px"><h2 style="margin:0">This & next week</h2><button class="small ghost" data-act="monthView">📅 Month</button></div>
    <div class="cal">${cells}</div>
    ${runs.map(r=>`<p class="small err" style="margin:8px 0 0">⚠ ${r.len} training days in a row: ${fmtDate(r.start)} – ${fmtDate(r.end)} (your limit: ${maxInRow()}). Consider a rest day in between: tap a day to change it.</p>`).join('')}
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

/* ================= WORKOUT =================
   Active workout: {id,key,tplV,date,type,boulder,start,end,idx,view,moving,stage,warmup,exercises,pre,post,notes,stretch,context,health,lastSnap,restBeep}
   idx = exercise you are at (-1 = warm-up / on the way to the first one), view = exercise on screen (one per screen).
   stage: checkin (energy, motivation, soreness, sleep) → steps → stretch → stretching → context → final.
   Time model (only timestamps are stored, so reloads, updates and offline change nothing):
     moving  = left previous exercise → "I'm at the machine" (exercise.arrived)
     setup   = arrived → first set start
     set     = Start → ✓ (✓ without Start: counted from the end of the rest countdown, est=true)
     rest    = ✓ → next Start (no stop button; turns "over" after the exercise's rest time)
   Leaving an exercise where nothing was pressed counts all sets, with arrived→left split evenly (est=true).
   Exercise: {name,tplName,kind,muscle,info,target,rest,sets:[{w,r,warm,start,end,est,pressed,done}],arrived,left,skipped} */
function lastSetsFor(name){ const e=prevOccurrence(name, null); return e? e.sets.filter(s=>s.done) : []; }
function lastWarmFor(name){ const e=prevOccurrence(name, null); return e && e.warm? e.warm : []; }
const newSet = (w, r, warm) => ({w, r:String(r??''), warm:!!warm, start:null, end:null, est:false, pressed:false, done:false});
function buildExercise(t){
  const prev = lastSetsFor(t.name), pw = lastWarmFor(t.name);
  const baseW = prev.length? num(prev[prev.length-1].w) : (num(t.w) || (t.kind==='bw'? latestBW() : 0));
  const lowR = parseInt(t.target), r0 = isFinite(lowR)? lowR : '';
  const work = Array.from({length:Math.max(1, t.sets|0)}, (_,i)=>{ const p=prev[i]||prev[prev.length-1];
    return newSet(hasWeight(t)? (p? num(p.w) : baseW) : '', p? p.r : r0, false); });
  const warm = Array.from({length:Math.max(0, t.warm|0)}, (_,i)=>{ const p=pw[i]||pw[pw.length-1];
    return newSet(t.kind==='w'? warmWeight(work[0]? work[0].w : baseW) : hasWeight(t)? (p? num(p.w) : baseW) : '', p? p.r : r0, true); });
  return {name:t.name, tplName:t.name, kind:t.kind, muscle:t.muscle||defaultMuscle(t.name), info:t.info||'', target:t.target,
    rest: t.rest!=null && t.rest!=='' ? +t.rest : S.settings.defaultRest, sets:[...warm, ...work], arrived:null, left:null, skipped:false};
}
function startWorkout(key, agoMin){
  const w = WORKOUTS.find(x=>x.key===key); const tpl = S.templates[key];
  const start = Date.now() - (agoMin||0)*60000;
  S.active = { id:uid(), key, tplV:tpl.v||1, date:iso(new Date(start)), type:w.type, boulder:w.boulder, start, end:null, idx:-1, view:0, moving:null, stage:'checkin', ago:agoMin||0, prevOverride:S.settings.nextOverride||null,
    warmup:{text:tpl.warmup.text, minutes:tpl.warmup.minutes, start, end:null},
    exercises: tpl.exercises.map(buildExercise), pre:{}, post:{}, notes:'', stretch:null, context:null, health:null, lastSnap:start, restBeep:null };
  S.settings.nextOverride = null;
  save(); closeModal(); go('workout');
}
const A = () => S.active;
const setState = x => x.end? 'done' : x.start? 'run' : 'todo';
const curEx = () => { const a=A(); return a && a.idx>=0? a.exercises[a.idx] : null; };
const viewEx = () => { const a=A(); return a.exercises[a.view]; };
const inSteps = () => { const a=A(); return a && a.stage==='steps' && (a.idx>=0 || !!a.warmup.end) && a.exercises.length>0; };
function nextExIdx(){ const a=A(); for(let i=a.idx+1;i<a.exercises.length;i++){ const e=a.exercises[i]; if(!e.arrived && !e.skipped) return i; } return -1; }
// index of the set whose ✓ started the rest that is running now (-1 = no rest running)
function liveRestIdx(e){
  if(e.sets.some(x=>setState(x)==='run')) return -1;
  const done=e.sets.filter(x=>x.end); if(!done.length) return -1;
  const last=done.reduce((p,q)=>p.end>q.end?p:q), li=e.sets.indexOf(last);
  return e.sets.slice(li+1).some(x=>setState(x)==='todo')? li : -1;
}
function stopRunning(e, ts){ e.sets.forEach(x=>{ if(setState(x)==='run'){ x.end=Math.max(x.start+1000, ts); x.done=true; } }); }
function leaveExercise(ts, skipped){
  const a=A(), e=curEx(); if(!e) return;
  stopRunning(e, ts);
  if(skipped) e.skipped=true;
  else if(!e.sets.some(x=>x.start||x.end)){ // nothing pressed at all: every set counts, arrival → leaving split evenly
    const from=e.arrived||ts, span=Math.max(0, ts-from)/e.sets.length;
    e.sets.forEach((x,i)=>{ x.start=from+i*span; x.end=from+(i+1)*span; x.est=true; x.done=true; });
  }
  e.left=ts; a.moving=ts;
}
function startSet(si){
  const a=A(), e=curEx(); if(!e || a.view!==a.idx || a.moving) return;
  const x=e.sets[si], ts=Date.now();
  e.sets.forEach(y=>{ if(y!==x && setState(y)==='run'){ y.end=ts; y.done=true; } });
  Object.assign(x, {start:ts, end:null, pressed:true, est:false, done:false}); woFocus=null;
}
function checkSet(si){
  const a=A(), e=viewEx(), x=e.sets[si], ts=Date.now(), isCur = e===curEx();
  if(x.end){ // undo
    Object.assign(x, {start:null, end:null, est:false, pressed:false, done:false});
    if(isCur && a.moving && !e.skipped){ a.moving=null; e.left=null; }
    return;
  }
  if(!isCur) return;
  x.end=ts; x.done=true;
  if(!x.start){ const prev=e.sets.filter(y=>y.end && y!==x).sort((p,q)=>q.end-p.end)[0];
    x.start=Math.min(prev? prev.end+e.rest*1000 : (e.arrived||ts), ts-1000); x.est=true; }
  e.sets.forEach(y=>{ if(y!==x && setState(y)==='run'){ y.end=Math.max(y.start+1000, x.start); y.done=true; } });
  woFocus=null;
  if(!a.moving && !e.sets.some(y=>setState(y)==='todo')) leaveExercise(ts, false);
}
function warmupDone(ts){
  const a=A(); ts=Math.min(Date.now(), Math.max(a.warmup.start+1000, ts));
  a.warmup.end=ts; a.idx=-1; a.view=0;
  if(!a.exercises.length){ a.end=ts; a.stage='stretch'; }
  else a.moving=ts;
  save(); closeModal(); woScroll='top'; render();
}
function arrive(){
  const a=A(), n=nextExIdx();
  if(n<0){ finishSteps(); return; }
  a.idx=n; a.view=n; a.exercises[n].arrived=Date.now(); a.moving=null; woFocus=null;
  save(); woScroll='top'; woAnim='down'; render();
}
// questions answered → the workout (and its warm-up) starts now, unless it was started "… min ago"
function checkinDone(){
  const a=A(), now=Date.now();
  if(!a.ago){ a.start=now; a.warmup.start=now; a.lastSnap=now; a.date=iso(); }
  a.stage='steps'; save(); window.scrollTo(0,0); render();
}
const woMuscles = a => [...new Set(a.exercises.map(e=>e.muscle).filter(Boolean))];
function finishSteps(){ const a=A(); a.end = a.moving || Date.now(); a.stage='stretch'; save(); closeModal(); window.scrollTo(0,0); render(); }
function endEarly(endTs){
  const a=A(); endTs=Math.min(Date.now(), endTs);
  if(a.idx<0 && !a.warmup.end) a.warmup.end=Math.max(a.warmup.start+1000, endTs);
  if(curEx() && !a.moving) leaveExercise(Math.max((curEx().arrived||a.start)+1000, endTs), false);
  a.exercises.forEach(e=>{ if(!e.arrived) e.skipped=true; });
  a.end = a.moving? Math.min(a.moving, endTs) : endTs; a.stage='stretch';
  save(); closeModal(); window.scrollTo(0,0); render();
}
function goBack(){
  const a=A();
  if(a.stage==='final'){ a.stage='context'; }
  else if(a.stage==='steps' && a.idx<0 && !a.warmup.end){ a.stage='checkin'; }
  else if(a.stage==='context'){ if(a.stretch && a.stretch.did){ a.stage='stretching'; a.stretch.end=null; } else { a.stage='stretch'; a.stretch=null; } }
  else if(a.stage==='stretching'){ a.stage='stretch'; a.stretch=null; }
  else if(a.stage==='stretch'){ a.stage='steps'; a.end=null; if(!a.exercises.length){ a.warmup.end=null; a.moving=null; } }
  save(); window.scrollTo(0,0); render();
}
function exSwitch(dir){
  const a=A(); if(!inSteps()) return;
  const nv = a.view + (dir==='up'?-1:1); if(nv<0 || nv>=a.exercises.length) return;
  a.view=nv; woFocus=null; woArmed=null; woAnim=dir; woScroll = dir==='up'? 'bottom' : 'top';
  save(false); render();
}
function exDoNext(i){
  const a=A(), L=a.exercises, pos=a.idx+1; if(i<pos) return;
  const [x]=L.splice(i,1); L.splice(pos,0,x);
  const c=curEx();
  if(c && !a.moving && !c.sets.some(s=>s.start||s.end)){ L[a.idx]=x; L[pos]=c; x.arrived=c.arrived; c.arrived=null; a.view=a.idx; } // nothing done here yet: swap right away
  else a.view = a.moving? pos : Math.max(0,a.idx);
  woFocus=null;
}
function exAddOne(t, toTpl){
  const a=A(), pos = a.idx+1, e=buildExercise(t);
  a.exercises.splice(pos, 0, e);
  if(toTpl){ const after = curEx()? curEx().tplName : null;
    tplChange(a.key, `Added “${t.name}”`, tp=>{ const i=after? tp.exercises.findIndex(x=>x.name===after) : -1; tp.exercises.splice(i>=0? i+1 : tp.exercises.length, 0, t); }); }
  if(a.moving) a.view=pos;
}
function gearSave(toTpl){
  const a=A(), e=viewEx(), g=id=>$('#'+id).value;
  const name=g('gName').trim()||e.name, info=g('gInfo').trim(), target=g('gTarget').trim()||e.target;
  const rest=Math.max(0, parseInt(g('gRest'))||0), nw=Math.max(0, parseInt(g('gWarm'))||0), ns=Math.max(1, parseInt(g('gSets'))||1);
  const warm=e.sets.filter(x=>x.warm), work=e.sets.filter(x=>!x.warm);
  const fit=(arr, n, isWarm)=>{ arr=arr.slice(0,n); while(arr.length<n){ const l=arr[arr.length-1] || (isWarm? {w:e.kind==='w'? warmWeight((work[0]||{}).w) : hasWeight(e)? num((work[0]||{}).w) : '', r:(work[0]||{}).r} : work[work.length-1]) || {w:'', r:parseInt(target)||''};
    arr.push(newSet(l.w, l.r, isWarm)); } return arr; };
  const oldTpl=e.tplName;
  Object.assign(e, {name, info, target, rest, sets:[...fit(warm,nw,true), ...fit(work,ns,false)]});
  if(toTpl){
    tplChange(a.key, `Changed “${name}”`, tp=>{ const te=tp.exercises.find(x=>x.name===oldTpl);
      const fields={name, info, target, rest, warm:nw, sets:ns};
      if(te) Object.assign(te, fields); else tp.exercises.push(Object.assign({kind:e.kind, muscle:e.muscle}, fields)); });
    e.tplName=name;
    toast(tplPendingNote());
  } else toast('Changed for this workout only');
}

// Warm-up sets follow the weight of the first working set until they are done (weight exercises only)
function syncWarm(e, si){
  const x=e.sets[si]; if(e.kind!=='w' || x.warm || e.sets.find(y=>!y.warm)!==x) return false;
  let ch=false; e.sets.forEach(y=>{ if(y.warm && !y.end){ y.w=warmWeight(x.w); ch=true; } }); return ch;
}
function wuGearSheet(){
  const a=A(), v=S.templates[a.key].v||1;
  return `<h2>⚙ Warm-up</h2>
  <label class="f">What you do (shown under the title)</label><textarea class="auto" rows="2" id="wuText" placeholder="e.g. 5 min rowing, band pull-aparts">${esc(a.warmup.text)}</textarea>
  <label class="f">Planned minutes</label><input id="wuMin" inputmode="numeric" value="${a.warmup.minutes||0}">
  <div class="card" style="background:var(--accent-soft);border:0;margin:12px 0 0;padding:10px"><span class="small"><b>Also update template</b>: today's workout uses it right away. ${esc(keyLabel(a.key))} v${v+1} is saved once when the workout ends (all changes of this workout together); v${v} stays in Settings.</span></div>
  <div class="grid2" style="margin-top:10px"><button class="big" data-act="wuSave" data-v="once">This workout only</button><button class="primary big" data-act="wuSave" data-v="tpl">Also update template</button></div>
  <button class="big" style="margin-top:8px;background:transparent;border:0" data-act="closeModal">Cancel</button>`;
}

/* ---- workout screens ---- */
let woFocus=null, woScroll=null, woAnim=null, woArmed=null, woArmT=0;
function stepBar(){
  const a=A(), fin=a.stage!=='steps' && a.stage!=='checkin';
  const segs=[`<i class="${a.warmup.end||fin?'done':'cur'}"></i>`];
  a.exercises.forEach((e,i)=>segs.push(`<i class="${e.skipped&&(e.left||fin)?'skip':e.left||fin&&e.arrived?'done':i===a.idx?'cur':''}${inSteps()&&i===a.view&&a.view!==a.idx?' view':''}"></i>`));
  segs.push(`<i class="${a.stage==='final'?'cur':''}"></i>`);
  return `<div class="steps">${segs.join('')}</div>`;
}
function scaleHtml(act, key, val, labels){ return `<div class="scale">${[1,2,3,4,5].map(n=>`<button class="chip ${val===n?'on':''}" data-act="${act}" data-k="${key}" data-v="${n}">${labels?labels[n-1]:n}</button>`).join('')}</div>`; }
const repUnit = e => e.kind==='time'?'sec':e.kind==='dur'?'min':'reps';
const setVal = (e, x) => `${hasWeight(e)?`${fw(x.w)} <small>kg ×</small> `:''}${esc(x.r)} <small>${repUnit(e)}</small>`;
function setEditor(e, x, si){
  const st=S.settings.step||0.25;
  return `<div class="edit">${hasWeight(e)?`<div class="stp2"><button data-act="stepW" data-s="${si}" data-v="-1" aria-label="Less weight">−</button><label><input inputmode="decimal" data-in="w" data-s="${si}" value="${esc(fw(x.w))}"><small>kg ±${fw(st)}</small></label><button data-act="stepW" data-s="${si}" data-v="1" aria-label="More weight">+</button></div>`:''}
    <div class="stp2"><button data-act="stepR" data-s="${si}" data-v="-1" aria-label="Less">−</button><label><input inputmode="numeric" data-in="r" data-s="${si}" value="${esc(x.r)}"><small>${repUnit(e)}</small></label><button data-act="stepR" data-s="${si}" data-v="1" aria-label="More">+</button></div></div>`;
}
// seconds per rep of a finished set, e.g. "4s/rep" (rep-based exercises only)
function perRep(e, x){ const r=num(x.r); if(!['w','bw','reps'].includes(e.kind) || !(r>0) || !x.start || !x.end) return ''; return `<span class="prep">${x.est?'~':''}${Math.max(1,Math.round((x.end-x.start)/1000/r))}s/rep</span>`; }
function setRow(e, x, si, label, live, isNext){
  const st=setState(x), left=!!e.left;
  const open = woFocus===si || st==='run' || (live && isNext && woFocus==null && !left);
  let btns;
  if(st==='done') btns=`<span class="sdur">${x.est?'~':''}${fmtClock(x.end-x.start)}${perRep(e,x)}</span><button class="ck" data-act="setCheck" data-s="${si}" aria-label="Undo set">✓</button>`;
  else if(st==='run') btns=`<span class="runclock" data-up="${x.start}">${fmtClock(Date.now()-x.start)}</span><button class="ck" data-act="setCheck" data-s="${si}">✓ Done</button>`;
  else if(left || !live) btns=`<span class="small muted">${left?'not done':'planned'}</span>`;
  else btns=`<button class="go" data-act="setStart" data-s="${si}">▶ Start</button><button class="ck" data-act="setCheck" data-s="${si}" aria-label="Done without Start">✓</button>`;
  return `<li class="${st}${left&&st!=='done'?' miss':''}"><div class="set ${st}${live&&isNext&&st==='todo'&&!left?' next':''}" data-act="setFocus" data-s="${si}">
    <div class="n">${label}</div><div class="val">${setVal(e,x)}</div><div class="btns">${btns}</div>${open?setEditor(e,x,si):''}</div></li>`;
}
function restRow(e, a, b, live){
  if(live) return `<li class="rst on"><div class="rest live" data-rest="${a.end}" data-len="${e.rest}"><div class="rbar"></div><span class="t">${fmtClock(e.rest*1000)}</span><span class="lb">rest left</span><span class="h">ends when you tap Start</span></div></li>`;
  if(b.start) return `<li class="rst"><div class="rest">Rest <b>${b.pressed?'':'~'}${fmtClock(b.start-a.end)}</b></div></li>`;
  return '';
}
function exSummary(e){ const w=e.sets.filter(x=>!x.warm), t=w[0]; return `${w.length} × ${esc(e.target)}${hasWeight(e)&&t?' · '+fw(t.w)+' kg':''} · rest ${e.rest} s`; }
// Progression: last time every working set reached the top of the rep range (e.g. 3 × 12 at 8-12) → suggest more weight.
const topReps = target => { const m=String(target||'').match(/\d+/g); return m? Math.max(...m.map(Number)) : 0; };
function progressHint(e){
  if(!hasWeight(e)) return null;
  const top=topReps(e.target), prev=prevOccurrence(e.name, null); if(!top || !prev) return null;
  const ps=prev.sets.filter(s=>s.done && !s.warm), n=e.sets.filter(x=>!x.warm).length;
  if(ps.length<Math.max(1,n) || !ps.every(s=>num(s.r)>=top)) return null;
  const pw=Math.max(...ps.map(s=>num(s.w))), step=S.settings.progStep||1;
  const work=e.sets.filter(x=>!x.warm);
  if(work.some(x=>x.end) || work.some(x=>num(x.w)>pw)) return null; // already heavier, or sets already started
  return {top, n:ps.length, pw, step, to:Math.round((pw+step)*100)/100};
}
function exScreen(){
  const a=A(), i=a.view, e=a.exercises[i], n=a.exercises.length;
  const live = i===a.idx, past = !live && !!e.arrived, nIdx=nextExIdx();
  const prevE = prevOccurrence(e.name, null);
  const lastTxt = prevE? prevE.sets.filter(s=>s.done).map(s=>setLabel(prevE,s)).join(' · ') : 'First time';
  const stat = e.skipped? ' · skipped' : past? ` · ${e.sets.filter(x=>x.done&&!x.warm).length}/${e.sets.filter(x=>!x.warm).length} sets${e.left?' · '+fmtClock(e.left-e.arrived):''}` : '';
  const rows=[];
  rows.push(`<li class="exh ${live?'cur':past?(e.skipped?'skp':'past'):'upc'}"><div class="eyebrow">${live?'':past?'Earlier · ':i===nIdx?'Up next · ':'Later · '}Exercise ${i+1} of ${n} · ${esc(e.muscle)}${stat}</div>
    <div class="titlerow"><div class="exname">${esc(e.name)}</div><div class="tbtns">${!past && !e.skipped? '<button class="icon" data-act="exMoveOpen" aria-label="Move exercises">⇅</button>' : ''}<button class="icon" data-act="exGear" aria-label="Exercise settings">⚙</button></div></div>
    ${e.info?`<div class="exinfo">${esc(e.info)}</div>`:''}
    <div class="small muted" style="margin-top:3px">${exSummary(e)}<br>Last time: ${esc(lastTxt)}</div></li>`);
  const ph = live && !a.moving? progressHint(e) : null;
  if(ph) rows.push(`<li class="ev"><div class="prog"><span>⬆ Last time ${ph.n} × ${ph.top} (top of ${esc(e.target)}). Go heavier: <b>${fw(ph.to)} kg</b></span><button class="small primary" data-act="progApply">+${fw(ph.step)} kg</button></div></li>`);
  if(!live && !past && a.moving && i===nIdx) rows.push(`<li class="mv"><div class="move"><div class="small">On the way here</div><div class="t" data-up="${a.moving}">${fmtClock(Date.now()-a.moving)}</div></div></li>`);
  if(e.arrived){ const fs=e.sets.filter(x=>x.start).map(x=>x.start).sort((p,q)=>p-q)[0];
    rows.push(`<li class="ev">Arrived <b>${fmtTime(e.arrived)}</b> · setting up <b ${fs?'':`data-up="${e.arrived}"`}>${fmtClock((fs||Date.now())-e.arrived)}</b></li>`); }
  const lr = live && !a.moving? liveRestIdx(e) : -1, firstTodo = live? e.sets.findIndex(x=>setState(x)==='todo') : -1;
  let wi=0, si=0, head=false;
  e.sets.forEach((x,k)=>{
    if(x.warm && k===0) rows.push(`<li class="div">Warm-up sets</li>`);
    if(!x.warm && !head){ head=true; rows.push(`<li class="div">Working sets</li>`); }
    if(k>0 && e.sets[k-1].end) rows.push(restRow(e, e.sets[k-1], x, lr===k-1));
    rows.push(setRow(e, x, k, x.warm? 'W'+(++wi) : String(++si), live, k===firstTodo));
  });
  if(live && !e.skipped) rows.push(`<li class="addset"><button class="link" data-act="setAdd">+ Add a set</button></li>`);
  if(live && a.moving && nIdx<0) rows.push(`<li class="done"><div class="finished"><div class="exname sm">✓ All exercises done</div><div class="small ink2">${a.exercises.filter(x=>x.arrived&&!x.skipped).length} of ${n} exercises · ${fmtDur(a.moving-a.start)} so far. Tap <b>Finish workout</b> below.</div></div></li>`);
  else if(live && a.moving) rows.push(`<li class="mv"><div class="move"><div class="small">${e.skipped?'Skipped · moving on':'Moving to the next exercise'}</div><div class="t" data-up="${a.moving}">${fmtClock(Date.now()-a.moving)}</div><div class="nx">${esc(a.exercises[nIdx].name)}${a.exercises[nIdx].info?`<small>${esc(a.exercises[nIdx].info)}</small>`:''}</div></div></li>`);
  else if(e.left){ const nx=a.exercises[i+1]; if(nx && nx.arrived) rows.push(`<li class="mvl"><div class="mvrow">Moving <b>${fmtClock(nx.arrived-e.left)}</b></div></li>`); }
  // "Previous" stays hidden until you pull down at the top (like pull-to-refresh)
  const top = i>0? `<button class="edge top${woArmed==='up'?' show':''}" id="edge-up" data-act="exPrev">${edgeInner('up',false)}</button>`
    : `<div class="edge stat">Started <b>${fmtTime(a.start)}</b>${a.warmup.end?` · warm-up <b>${fmtClock(a.warmup.end-a.warmup.start)}</b>`:''}</div>`;
  const bot = i<n-1? `<button class="edge bot" id="edge-down" data-act="exNext">${edgeInner('down',false)}</button>` : `<div class="edge bot stat">Last exercise of the workout</div>`;
  const banner = past? `<div class="viewing">Earlier exercise. You can still fix kg and reps.</div>` : !live? `<div class="viewing">Not started yet. It begins with “I'm at the machine”.</div>` : '';
  const snapDue = S.settings.wipSave>0 && Date.now()-(a.lastSnap||a.start) >= S.settings.wipSave*60000;
  return `${top}<div id="wopage" class="${woAnim?'slide-'+woAnim:''}">${banner}
    ${snapDue? `<div class="card row between" style="padding:8px 10px;border-color:var(--accent)"><span class="small">☁ Save a copy of this workout to iCloud?</span><button class="primary" data-act="wipSnap">Save</button></div>`:''}
    <ol class="tl">${rows.join('')}</ol>
    ${live? `<div class="row between" style="margin-top:10px"><span></span><button class="link" style="color:var(--bad)" data-act="endEarlyOpen">End workout early…</button></div>`:''}</div>${bot}`;
}
/* edge texts: idle → armed (after the 1st pull) → ready (dragged far enough) */
function edgeInner(dir, ready){
  const a=A(), t = a.exercises[a.view + (dir==='up'?-1:1)]; if(!t) return '';
  const armed = woArmed===dir, arw = dir==='up'?'↑':'↓';
  const label = dir==='up'? 'Previous' : (a.view+1===nextExIdx()? 'Up next' : 'Next');
  const line = ready? (armed? `Let go for <b>${esc(t.name)}</b>` : 'Let go, then pull once more')
    : armed? `Pull again for <b>${esc(t.name)}</b>` : `${label}: <b>${esc(t.name)}</b>`;
  const hint = !ready && !armed? `<span class="hint">pull ${dir==='up'?'down':'up'} twice</span>` : '';
  return dir==='up'? `<span class="arw">${arw}</span><span>${line}</span>${hint}` : `<span>${line}</span>${hint}<span class="arw">${arw}</span>`;
}
function viewWorkout(){
  const a=A(); if(!a) return '<div class="empty">No active workout.</div>';
  // same header on every step: left = back, middle = workout + where you are + clock, right = add exercise (during the exercises)
  const where = inSteps()? `${a.view+1} / ${a.exercises.length}` : a.stage==='checkin'? 'Check-in' : a.stage==='steps'? 'Warm-up' : a.stage==='final'? 'Finish' : a.stage==='context'? 'Almost done' : 'Stretching';
  const left = inSteps()? `<button class="icon" data-act="exPrev" ${a.view===0?'disabled':''} aria-label="Previous exercise">‹</button>`
    : a.stage!=='checkin'? '<button class="icon" data-act="back" aria-label="Back">‹</button>' : '<span></span>';
  const right = inSteps()? '<button class="icon" data-act="exAddOpen" aria-label="Add exercise">＋</button>' : '<span></span>';
  const head = `<div class="wohead">${left}<div class="mid"><b class="t-${a.type}">${esc(woLabel(a))}</b> · ${where}<br><span class="clock" id="elapsed">${fmtClock((a.end||Date.now())-a.start)}</span></div>${right}</div>` + stepBar();
  if(a.stage==='checkin'){
    const pre=a.pre||{}, mus=woMuscles(a);
    return head + `<div class="eyebrow">Before you start</div><div class="exname" style="margin:2px 0 12px">How do you feel?</div>
    <div class="card">
      <label class="f" style="margin-top:0">Energy</label>${scaleHtml('pre','energy',pre.energy,['😵','😕','😐','🙂','💪'])}
      <label class="f">Motivation</label>${scaleHtml('pre','motivation',pre.motivation,['🛌','😒','😐','😃','🚀'])}
      <label class="f">Soreness in your ${esc(a.type)} muscles (1 = none, 5 = very sore)</label>
      ${mus.length?`<div class="small muted" style="margin:-2px 0 6px">${mus.map(esc).join(' · ')}</div>`:''}${scaleHtml('pre','soreness',pre.soreness)}
      <label class="f">Sleep last night (hours)</label><input inputmode="decimal" data-pre="sleep" value="${esc(pre.sleep||'')}" placeholder="e.g. 7.5"></div>
    <button class="primary big" data-act="checkinDone">Start workout<span class="sub">Warm-up next</span></button>
    <div class="row between" style="margin-top:6px"><button class="link" data-act="checkinDone">Skip questions</button><button class="link" style="color:var(--bad)" data-act="checkinCancel">Cancel workout</button></div>`;
  }
  if(a.stage==='stretch') return head + `
    <div class="eyebrow">Workout ended ${fmtTime(a.end)} · ${fmtDur(a.end-a.start)}</div>
    <div class="exname" style="margin:2px 0 14px">Will you stretch?</div>
    <div class="grid2"><button class="huge yes" data-act="stretchYes">Yes</button><button class="huge no" data-act="stretchNo">No</button></div>`;
  if(a.stage==='stretching') return head + `
    <div class="eyebrow">After the workout</div><div class="exname" style="margin:2px 0 12px">Stretching</div>
    <ol class="tl"><li class="run"><div class="set run" style="cursor:default"><div class="n">⏱</div><div class="val">Stretching</div><div class="btns"><span class="runclock" id="stepClock">${fmtClock(Date.now()-a.stretch.start)}</span></div></div></li></ol>
    <button class="primary big" style="margin-top:16px" data-act="stretchDone">Done stretching</button>
    <button class="link" data-act="agoOpen" data-v="stretch">Finished earlier…</button>`;
  if(a.stage==='context') return head + `
    <div class="eyebrow">One last question</div><div class="exname" style="margin:2px 0 4px">How was your time today?</div>
    <p class="small ink2" style="margin:0 0 14px">This shows whether time pressure affects your training.</p>
    <button class="huge soft" data-act="ctx" data-v="limited">⏱ Time-limited<br><span class="small ink2">Had plans afterwards, had to hurry</span></button>
    <button class="huge soft" style="margin-top:10px" data-act="ctx" data-v="free">🧘 No plans after<br><span class="small ink2">Could take my time</span></button>`;
  if(a.stage==='final'){
    const f=a.post||{}, h=a.health;
    const doneSets = a.exercises.reduce((n,e)=>n+e.sets.filter(s=>s.done&&!s.warm).length,0);
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
      <div class="row between" style="margin-top:6px"><span></span><button class="link" style="color:var(--bad)" data-act="discard">Discard workout</button></div>`;
  }
  if(a.idx<0 && !a.warmup.end){
    return head + `<ol class="tl">
      <li class="exh cur"><div class="eyebrow">Before the first exercise · ${esc(a.type)}</div>
        <div class="titlerow"><div class="exname">Warm-up</div><div class="tbtns"><button class="icon" data-act="wuGear" aria-label="Warm-up settings">⚙</button></div></div>
        ${a.warmup.text?`<div class="exinfo">${esc(a.warmup.text)}</div>`:'<div class="small muted">No warm-up written down yet. Add it with ⚙.</div>'}
        <div class="small muted" style="margin-top:3px">Planned ${a.warmup.minutes||0} min</div></li>
      <li class="ev">Started <b>${fmtTime(a.warmup.start)}</b> · warming up <b data-up="${a.warmup.start}">${fmtClock(Date.now()-a.warmup.start)}</b></li>
      </ol>
      <div class="row between" style="margin-top:10px"><button class="link" data-act="agoOpen" data-v="step">Finished earlier…</button><button class="link" style="color:var(--bad)" data-act="endEarlyOpen">End workout early…</button></div>`;
  }
  return head + exScreen();
}
/* bottom bar during the exercises (rendered into #timer, fixed above the tabs) */
function renderTimer(){
  const box=$('#timer'), a=S.active;
  const warm = a && a.stage==='steps' && a.idx<0 && !a.warmup.end;
  const show = a && VIEW==='workout' && S.profile.onboarded && (inSteps() || warm);
  document.body.classList.toggle('hasdock', !!show);
  if(!show){ box.innerHTML=''; return; }
  const nIdx=nextExIdx(), nx=nIdx>=0? a.exercises[nIdx] : null, e=curEx();
  let html;
  if(warm) html = `<button class="primary big" data-act="warmupDone">Warm-up done${a.exercises[0]?`<span class="sub">Next: ${esc(a.exercises[0].name)}</span>`:''}</button>`;
  else if(a.moving) html = nx? `<button class="big mvb" data-act="arrive">I'm at the machine<span class="sub">${esc(nx.name)}</span></button>` : `<button class="primary big" data-act="arrive">Finish workout<span class="sub">Stretching and how it went</span></button>`;
  else if(a.view!==a.idx) html = `<button class="primary big" data-act="exToCur">Back to current<span class="sub">${esc(e?e.name:'')}</span></button>`;
  else { const none = e && !e.sets.some(x=>x.start||x.end);
    html = `<div class="dockrow"><button class="big danger" data-act="exSkipOpen">⤼ Skip</button><button class="big" data-act="exMoveOn">Move on<span class="sub">${nx?'→ '+esc(nx.name):'Finish'}</span></button></div><div class="note">${none?'Nothing ticked: all sets count, time split evenly':'Sets you haven\'t done won\'t count'}</div>`; }
  box.innerHTML = `<div class="dockbar"><div class="in">${html}</div></div>`;
}
let audioCtx = null;
function unlockAudio(){ try{ if(!audioCtx){ audioCtx = new (window.AudioContext||window.webkitAudioContext)(); } if(audioCtx.state==='suspended') audioCtx.resume(); }catch(e){} }
function beep(){
  if(!S.settings.sound || !audioCtx) return;
  try{ [0,0.25,0.5].forEach(t=>{ const o=audioCtx.createOscillator(), g=audioCtx.createGain(); o.frequency.value=880; o.connect(g); g.connect(audioCtx.destination);
      const t0=audioCtx.currentTime+t; g.gain.setValueAtTime(0.0001,t0); g.gain.exponentialRampToValueAtTime(0.4,t0+0.02); g.gain.exponentialRampToValueAtTime(0.0001,t0+0.18); o.start(t0); o.stop(t0+0.2); }); }catch(e){}
  if(navigator.vibrate) navigator.vibrate([200,100,200]);
}
function tick(){
  const a=S.active; if(!a) return;
  document.querySelectorAll('[data-up]').forEach(el=>el.textContent=fmtClock(Date.now()-+el.dataset.up));
  document.querySelectorAll('[data-rest]').forEach(el=>{
    const len=+el.dataset.len*1000, gone=Date.now()-+el.dataset.rest, left=len-gone, over=left<=0;
    el.classList.toggle('over',over);
    el.querySelector('.t').textContent=(over?'+':'')+fmtClock(Math.abs(left));
    el.querySelector('.lb').textContent=over?'over · go!':'rest left';
    el.querySelector('.rbar').style.width=Math.min(100,len?gone/len*100:100)+'%';
  });
  // beep once when the running rest of the current exercise is over
  const e=curEx();
  if(e && a.stage==='steps' && !a.moving){ const li=liveRestIdx(e); if(li>=0){ const at=e.sets[li].end+e.rest*1000; if(e.rest>0 && Date.now()>=at && a.restBeep!==at){ a.restBeep=at; save(false); beep(); } } }
  const el=$('#elapsed'); if(el) el.textContent=fmtClock((a.end||Date.now())-a.start);
  const sc=$('#stepClock'); if(sc){ const st = a.stage==='stretching'? a.stretch.start : a.warmup.start; sc.textContent=fmtClock(Date.now()-st); }
}
setInterval(tick, 500);

/* ---- switching exercises: past the top/bottom edge twice (touch drag or mouse wheel) ---- */
const PULL_AT=60;
function gestureOn(){ return VIEW==='workout' && inSteps() && !$('#modal').innerHTML; }
function atTop(){ return window.scrollY<=3; }
function atBottom(){ return window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2; }
function edgeDir(goingUp){
  const a=A();
  if(goingUp && atTop() && a.view>0) return 'up';
  if(!goingUp && atBottom() && a.view<a.exercises.length-1) return 'down';
  return null;
}
function updateEdges(drag){
  ['up','down'].forEach(dir=>{ const el=document.getElementById('edge-'+dir); if(!el) return;
    const d = drag && drag.dir===dir? drag.d : 0, ready=d>=PULL_AT;
    el.classList.toggle('armed', woArmed===dir); el.classList.toggle('ready', ready);
    el.innerHTML=edgeInner(dir, ready);
    if(dir==='up'){ el.classList.toggle('show', d>0 || woArmed==='up'); el.style.paddingTop = d>0? (8+Math.min(d,110))+'px' : ''; }
    else { el.style.paddingBottom=(10+Math.min(d,110))+'px'; if(d) window.scrollTo(0, document.documentElement.scrollHeight); }
  });
}
function edgeGesture(dir){
  if(woArmed===dir){ clearTimeout(woArmT); exSwitch(dir); return; }
  woArmed=dir; clearTimeout(woArmT); woArmT=setTimeout(()=>{ woArmed=null; updateEdges(); },3000); updateEdges();
}
let woPull=null, wAcc=0, wDir=null, wLock=0, wIdle=0;
/* pull-to-refresh on Today / History / Stats / Settings: reloads the data and checks for a new app version */
let ptr=null;
function ptrOn(){ return VIEW!=='workout' && S.profile.onboarded && !$('#modal').innerHTML; }
function ptrShow(d){
  let el=$('#ptr'); if(!el){ el=document.createElement('div'); el.id='ptr'; document.body.appendChild(el); }
  const ready=d>=PULL_AT; el.className=d>0?'on'+(ready?' ready':''):''; el.style.height=Math.min(d,110)+'px';
  el.innerHTML=d>0? `<span class="arw">${ready?'⟳':'↓'}</span>${ready?'Let go to refresh':'Pull to refresh'}` : '';
}
function ptrRefresh(){
  S=load(); render(); if(!window.GymLoader) toast('Refreshed');
  if(window.GymLoader) GymLoader.checkNow(true);
}
/* sheets: drag down (from the top of their content) to close; the page behind never scrolls */
let sh=null;
function innerScroll(el, sheet){ // a scrollable box inside the sheet (textarea, wide list) that can still scroll up
  for(; el && el!==sheet; el=el.parentElement){ if(el.scrollTop>0 && el.scrollHeight>el.clientHeight) return true; }
  return false;
}
function sheetEnd(){
  if(!sh) return; const p=sh; sh=null; if(!p.on) return;
  const el=p.sheet, dt=Math.max(1,Date.now()-p.t), fast=p.d>40 && p.d/dt>0.5;
  el.style.transition='transform .2s ease-out';
  if(p.d>110 || fast){ el.style.transform='translateY(100%)'; setTimeout(()=>{ if($('#modal .sheet')===el) closeModal(); }, 190); }
  else { el.style.transform=''; setTimeout(()=>{ el.style.transition=''; }, 210); }
}
document.addEventListener('touchstart',ev=>{
  const sheet=$('#modal .sheet');
  sh = sheet? {y:ev.touches[0].clientY, x:ev.touches[0].clientX, sheet, d:0, on:false, t:Date.now(), tgt:ev.target} : null;
  woPull = gestureOn()? {y:ev.touches[0].clientY, d:0, dir:null} : null;
  ptr = ptrOn() && atTop()? {y:ev.touches[0].clientY, d:0} : null;
},{passive:true});
document.addEventListener('touchmove',ev=>{
  if(sh){ const el=sh.sheet, dy=ev.touches[0].clientY-sh.y, dx=ev.touches[0].clientX-sh.x;
    if(!sh.on && dy>6 && Math.abs(dy)>Math.abs(dx) && el.scrollTop<=0 && el.contains(sh.tgt) && !innerScroll(sh.tgt, el)){ sh.on=true; sh.y=ev.touches[0].clientY; sh.t=Date.now(); }
    if(sh.on){ ev.preventDefault(); sh.d=Math.max(0, ev.touches[0].clientY-sh.y); el.style.transition='none'; el.style.transform=`translateY(${sh.d}px)`; return; }
    // keep the page behind still: backdrop, or a sheet that has nothing to scroll in that direction
    const canScroll = el.contains(sh.tgt) && el.scrollHeight>el.clientHeight && (dy<0 ? el.scrollTop+el.clientHeight<el.scrollHeight : el.scrollTop>0);
    if(!canScroll && !innerScroll(sh.tgt, el) && Math.abs(dy)>=Math.abs(dx)) ev.preventDefault();
    return; }
  if(ptr){ const dy=ev.touches[0].clientY-ptr.y;
    if(dy>0 && atTop()){ ev.preventDefault(); ptr.d=dy*0.5; ptrShow(ptr.d); } else if(ptr.d){ ptr.d=0; ptrShow(0); } }
  if(!woPull) return; const dy=ev.touches[0].clientY-woPull.y;
  const dir = woPull.dir || (dy!==0? edgeDir(dy>0) : null);
  if(!dir || (dir==='up'&&dy<=0) || (dir==='down'&&dy>=0)){ if(woPull.dir){ woPull.d=0; updateEdges(); } return; }
  ev.preventDefault();
  if(!woPull.dir){ woPull.dir=dir; woPull.y=ev.touches[0].clientY; return; } // measure from where the edge was reached
  woPull.d=Math.abs(dy)*0.5; updateEdges({dir, d:woPull.d});
},{passive:false});
document.addEventListener('touchend',()=>{
  sheetEnd();
  if(ptr){ const p=ptr; ptr=null; ptrShow(0); if(p.d>=PULL_AT) ptrRefresh(); }
  if(!woPull) return; const p=woPull; woPull=null; if(!p.dir) return; updateEdges(); if(p.d>=PULL_AT) edgeGesture(p.dir); });
document.addEventListener('wheel',ev=>{
  if(!gestureOn()) return; const dir=edgeDir(ev.deltaY<0); if(!dir) return;
  ev.preventDefault(); if(Date.now()<wLock) return;
  if(wDir!==dir){ wAcc=0; wDir=dir; }
  wAcc+=Math.abs(ev.deltaY)*0.3; updateEdges({dir, d:wAcc}); clearTimeout(wIdle);
  if(wAcc>=PULL_AT){ wAcc=0; wLock=Date.now()+650; updateEdges(); edgeGesture(dir); } // pause so one long wheel spin counts once
  else wIdle=setTimeout(()=>{ wAcc=0; updateEdges(); },300);
},{passive:false});
window.addEventListener('scroll',()=>{ // scrolling back into the exercise disarms the edge
  if(!woArmed) return; if((woArmed==='up'&&!atTop())||(woArmed==='down'&&!atBottom())){ woArmed=null; updateEdges(); } },{passive:true});
function afterWorkoutRender(){
  if(woScroll==='bottom') window.scrollTo(0, document.documentElement.scrollHeight);
  else if(woScroll==='top') window.scrollTo(0,0);
  woScroll=null; woAnim=null;
}

/* ---- sheets ---- */
function agoSheet(kind){
  const title = kind==='end'? 'End workout early?' : kind==='stretch'? 'When did you finish stretching?' : 'When did you finish the warm-up?';
  const note = kind==='end'? 'The exercise you are at counts with the sets you ticked. The rest are marked as skipped.' : 'Use this if you forgot to tap the button.';
  return `<h2>${title}</h2><p class="small ink2">${note}</p>
  <button class="primary big" data-act="agoPick" data-k="${kind}" data-v="0">${kind==='end'?'Yes, finished now':'Just now'}</button>
  <label class="f">…or this many minutes ago</label>
  <div class="chips">${AGO.map(m=>`<button class="chip" data-act="agoPick" data-k="${kind}" data-v="${m}">${m} min</button>`).join('')}</div>
  <button class="big" style="margin-top:14px" data-act="closeModal">Cancel</button>`;
}
function exGearSheet(){
  const a=A(), e=viewEx(), ws=e.sets.filter(x=>x.warm).length, ns=e.sets.length-ws, v=S.templates[a.key].v||1;
  return `<h2>⚙ ${esc(e.name)}</h2><p class="small ink2" style="margin-top:0">kg and reps are changed directly on the sets.</p>
  <label class="f">Name (write “single handedly” here if it's one arm or leg)</label><input id="gName" value="${esc(e.name)}">
  <label class="f">Info under the name (new lines allowed)</label><textarea class="auto" rows="1" id="gInfo" placeholder="e.g. Setting 7 · elbows down">${esc(e.info)}</textarea>
  <div class="grid2"><div><label class="f">Warm-up sets</label><input id="gWarm" inputmode="numeric" value="${ws}"></div><div><label class="f">Working sets</label><input id="gSets" inputmode="numeric" value="${ns}"></div>
  <div><label class="f">Target (reps)</label><input id="gTarget" value="${esc(e.target)}"></div><div><label class="f">Rest (s)</label><input id="gRest" inputmode="numeric" value="${e.rest}"></div></div>
  <div class="card" style="background:var(--accent-soft);border:0;margin:12px 0 0;padding:10px"><span class="small"><b>Also update template</b>: today's workout uses it right away. ${esc(keyLabel(a.key))} v${v+1} is saved once when the workout ends (all changes of this workout together); v${v} stays in Settings.</span></div>
  <div class="grid2" style="margin-top:10px"><button class="big" data-act="gearSave" data-v="once">This workout only</button><button class="primary big" data-act="gearSave" data-v="tpl">Also update template</button></div>
  <button class="link" style="color:var(--bad);margin-top:6px" data-act="gearRemove">Remove from template…</button>
  <button class="big" style="margin-top:8px;background:transparent" data-act="closeModal">Cancel</button>`;
}
function exMoveSheet(){
  const a=A(), c=curEx(), fresh = c && !a.moving && !c.sets.some(s=>s.start||s.end);
  const li=a.exercises.map((x,i)=>{
    const tag = i===a.idx? '<span class="pill" style="color:var(--accent)">now</span>' : x.skipped? '<span class="pill" style="color:var(--bad)">skipped</span>' : x.arrived? '<span class="pill" style="color:var(--good)">done</span>' : '';
    const can = i>a.idx && !x.arrived;
    const ctl = can? `<button class="icon" data-act="exUp" data-i="${i}" ${i-1<=a.idx?'disabled':''} aria-label="Earlier">↑</button><button class="icon" data-act="exDown" data-i="${i}" ${i===a.exercises.length-1?'disabled':''} aria-label="Later">↓</button><button class="primary" style="padding:6px 10px" data-act="exDoNext" data-i="${i}">${fresh?'Do now':'Do next'}</button>` : '';
    return `<div class="list-item"><div style="flex:1;min-width:0">${esc(x.name)}<div class="small muted">${exSummary(x)}</div></div>${tag}${ctl}</div>`; }).join('');
  return `<h2>Move exercises</h2><p class="small ink2" style="margin-top:0">Machine taken? Pick what you do next. The order only changes for this workout.</p>${li}
  <button class="big" style="margin-top:10px" data-act="closeModal">Done</button>`;
}
function exAddSheet(){
  return `<h2>Add exercise</h2><p class="small ink2" style="margin-top:0">It comes right after the current exercise.</p>
  <label class="f">Name</label><input id="aName" placeholder="e.g. Reverse Flys single handedly">
  <label class="f">Info (new lines allowed)</label><textarea class="auto" rows="1" id="aInfo" placeholder="e.g. Bench at 45°"></textarea>
  <div class="grid2"><div><label class="f">Type</label><select id="aKind">${Object.entries(KINDS).map(([k,l])=>`<option value="${k}">${l}</option>`).join('')}</select></div>
  <div><label class="f">Muscle</label><select id="aMuscle">${MUSCLES.map(m=>`<option>${m}</option>`).join('')}</select></div></div>
  <div class="grid3"><div><label class="f">Sets</label><input id="aSets" inputmode="numeric" value="3"></div><div><label class="f">kg</label><input id="aW" inputmode="decimal" value=""></div><div><label class="f">Reps</label><input id="aR" inputmode="numeric" value="10"></div></div>
  <label class="f">Rest (s)</label><input id="aRest" inputmode="numeric" value="${S.settings.defaultRest}">
  <div class="grid2" style="margin-top:12px"><button class="big" data-act="exAdd" data-v="once">This workout only</button><button class="primary big" data-act="exAdd" data-v="tpl">Also add to template</button></div>
  <button class="big" style="margin-top:8px;background:transparent" data-act="closeModal">Cancel</button>`;
}
function exSkipSheet(){ const e=curEx();
  return `<h2>Skip ${esc(e.name)}?</h2><p class="small ink2">${e.sets.some(x=>x.end)?'The sets you already ticked still count. ':''}Moving to the next exercise starts now.</p>
  <div class="grid2"><button class="big" data-act="closeModal">Cancel</button><button class="big no" data-act="exSkip">Skip exercise</button></div>`; }
let startMode='gym';
function startSheet(){
  const tp=todayPlan(), planned = tp.key && tp.key!=='rest';
  const plan = planned? {key:tp.key} : nextPlan();
  const seg = `<div class="seg"><button class="${startMode==='gym'?'on':''}" data-act="startMode" data-v="gym">🏋️ Gym workout</button><button class="${startMode==='act'?'on':''}" data-act="startMode" data-v="act">⛳ Other activity</button></div>`;
  if(startMode==='act'){
    const recent=[...new Set(sortSessions(S.sessions.filter(s=>s.activity)).reverse().map(s=>s.activity))].slice(0,6);
    return `<h2>Log an activity</h2>${seg}
    <p class="small ink2" style="margin-top:0">Golf, swimming, a hike … It shows in your calendar and history but doesn't change your training plan.</p>
    <label class="f">What did you do?</label><input id="acName" placeholder="e.g. Golf" autocomplete="off">
    ${recent.length?`<div class="chips" style="margin-top:6px">${recent.map(n=>`<button class="chip" data-act="acPick" data-v="${esc(n)}">${esc(n)}</button>`).join('')}</div>`:''}
    <label class="f">How long (min)</label><input id="acMin" inputmode="numeric" placeholder="e.g. 90">
    <label class="f">Finished</label><select id="acAgo"><option value="0">Just now</option>${[15,30,60,120,180,240].map(m=>`<option value="${m}">${m>=60?m/60+' h':m+' min'} ago</option>`).join('')}</select>
    <div class="grid2" style="margin-top:16px"><button class="big" data-act="closeModal">Cancel</button><button class="primary big" data-act="acSave">Save activity</button></div>`;
  }
  return `<h2>Start workout?</h2>${seg}
  <label class="f">What are you training today?</label>
  <select id="stKey">${WORKOUTS.map(w=>`<option value="${w.key}" ${w.key===plan.key?'selected':''}>${w.label}${w.key===plan.key?(planned?' (planned today)':' (next in rotation)'):''}</option>`).join('')}</select>
  <p class="small muted" style="margin:4px 0 0">Doing something else than planned is fine: the plan for the coming days adjusts.</p>
  <label class="f">Started</label>
  <select id="stAgo"><option value="0">Now</option>${[5,10,15,20,30,45,60].map(m=>`<option value="${m}">${m} min ago</option>`).join('')}</select>
  <div class="grid2" style="margin-top:16px"><button class="big" data-act="closeModal">Cancel</button><button class="primary big" data-act="startGo">Yes, start</button></div>`;
}
function saveWorkout(){
  const a=A(), newV=tplCommit();
  const bwv = num(a.post && a.post.bw); if(bwv) upsertBW(a.date,bwv);
  const prs=[];
  a.exercises.forEach(e=>{ if(!hasWeight(e)) return; const best=Math.max(0,...e.sets.filter(s=>s.done&&!s.warm).map(s=>e1rm(e,s))); const prev=bestE1RM(e.name); if(best>0 && prev>0 && best>prev) prs.push(e.name); });
  const ses = { id:a.id, date:a.date, type:a.type, boulder:a.boulder, status:'done', start:a.start, end:a.end, tplKey:a.key, tplV:a.tplV,
    warmup:a.warmup, exercises:a.exercises.map(e=>{ const done=e.sets.filter(s=>s.done);
      return Object.assign({}, e, {sets:done.filter(s=>!s.warm), warm:done.filter(s=>s.warm), start:e.arrived, end:e.left, skipped:e.skipped||!done.length}); }),
    pre:a.pre, post:a.post, notes:a.notes, stretch:a.stretch, context:a.context, health:a.health };
  S.sessions.push(ses); S.active=null;
  if(S.healthPending && S.healthPending.target==='active') S.healthPending=null;
  save(); go('today');
  toast((prs.length? `Saved. New PR: ${prs.join(', ')} 🎉` : 'Workout saved 💪') + (newV? ` · ${keyLabel(ses.tplKey)} v${newV} saved` : ''));
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
    return `<div class="row between"><h2 style="margin:0">${d.showMode?'Add entry':'Move workout'}</h2><button class="link" data-act="manual" data-v="move">ⓘ How moving works</button></div>${modeSeg}
    <p class="small ink2">${fmtDate(from)}${from>=today?` (<b>${esc(keyLabel(key))}</b>)`:''} becomes a rest day. The day you pick becomes a training day with the <b>next workout of your rotation</b>; the days after it adjust. Not counted as a skip.</p>
    <label class="f">Move to</label>
    ${cands.length? `<div class="chips">${cands.map(c=>`<button class="chip ${d.moveTo===c.date?'on':''}" data-act="mvPick" data-v="${c.date}">${fmtDate(c.date)} ${c.ok?'✓':'⚠'+c.run}</button>`).join('')}</div>`
      : '<p class="small" style="color:var(--warn)">No free day within 3 days. Log it as a skip instead.</p>'}
    ${sel? `<p class="small ink2" style="margin:8px 0 0">${sel.wasTraining? `${fmtDate(sel.date)} is already a training day: your following workouts shift by one day.` : `${fmtDate(sel.date)} was a rest day and becomes a training day.`}</p>
      ${sel.ok? `<p class="small ok">✓ Fine for your routine: ${sel.run} training day${sel.run>1?'s':''} in a row.</p>`
      : `<p class="small err">⚠ That makes ${sel.run} training days in a row (your limit: ${maxInRow()}). Possible, but recovery comes first.</p>`}` : ''}
    ${sel && sel.date<today? `<label class="f">What did you train on ${fmtDate(sel.date)}?</label><select id="enKey">${WORKOUTS.map(w=>`<option value="${w.key}" ${d.key===w.key?'selected':''}>${w.label}</option>`).join('')}<option value="">Didn't train that day either</option></select>` : ''}
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
    const sub = s.activity? `Activity${s.start&&s.end?' · '+fmtDur(s.end-s.start):''}` : isSkip ? `Skip · ${esc(s.skip?.reason||'')}${s.skip?.instead?' · '+esc(s.skip.instead):''}`
      : `${sessionSets(s)} sets · ${fmtNum(sessionVolume(s))} kg${s.end&&s.start?' · '+fmtDur(s.end-s.start):''}${s.stretch?(s.stretch.did?' · stretched':' · no stretch'):''}`;
    return `<div class="list-item" data-act="day" data-v="${s.date}">
      <span class="dot" style="background:${isSkip?'var(--bad)':s.activity?'var(--muted)':`var(--${s.type.toLowerCase()})`}"></span>
      <div style="flex:1"><div><b>${esc(s.activity||s.type)}${s.boulder?' + Boulder':''}</b> <span class="muted small">${fmtDate(s.date)} ${s.date.slice(0,4)}</span></div><div class="small ink2">${sub}</div></div>
      <span class="muted">›</span></div>`;
  }).join('');
  return `<h1>History</h1>
  ${monthCalendarHtml()}
  <div class="seg">${seg}</div>
  <div class="card">${items||'<div class="empty">Nothing logged yet.</div>'}</div>
  <button class="ghost big" data-act="manualOpen">+ Add past session or skip</button>`;
}
// Finished workout as one line from top to bottom (sessions recorded with the set flow, i.e. exercises with "arrived")
function recordTimeline(s){
  const exs=s.exercises||[]; let mv=0, ar=0, st=0, rs=0, rows=[];
  const wu = s.warmup&&s.warmup.end? s.warmup.end-s.warmup.start : 0;
  rows.push(`<li class="ev">Started <b>${fmtTime(s.start)}</b>${wu?` · warm-up <b>${fmtClock(wu)}</b>`:''}</li>`);
  exs.forEach((e,i)=>{
    const all=[...(e.warm||[]).map(x=>Object.assign({},x,{warm:true})), ...e.sets].filter(x=>x.done);
    const timed=all.filter(x=>x.start&&x.end).sort((p,q)=>p.start-q.start);
    if(timed[0] && e.arrived) ar += Math.max(0, timed[0].start-e.arrived);
    timed.forEach((x,j)=>{ st+=x.end-x.start; if(j) rs+=Math.max(0, x.start-timed[j-1].end); });
    const prev = prevOccurrence(e.name, s), d = prev && e.sets.length? topVal(e)-topVal(prev) : null;
    rows.push(`<li class="exh ${e.skipped&&!all.length?'skp':'past'}"><div class="eyebrow">Exercise ${i+1} · ${esc(e.muscle||'')}${e.skipped&&!all.length?' · skipped':e.start&&e.end?' · '+fmtClock(e.end-e.start):''}</div>
      <div class="exname sm">${esc(e.name)}</div>${e.info?`<div class="exinfo">${esc(e.info)}</div>`:''}
      ${all.length? `<div class="small">${d==null?'<span class="muted">first time</span>':deltaHtml(d,unitOf(e))+' <span class="muted">vs. last time</span>'}</div>`:''}</li>`);
    if(e.arrived && timed[0]) rows.push(`<li class="ev">Arrived <b>${fmtTime(e.arrived)}</b> · setting up <b>${fmtClock(timed[0].start-e.arrived)}</b></li>`);
    let wi=0, si=0, head=false;
    timed.forEach((x,j)=>{
      if(x.warm && j===0) rows.push('<li class="div">Warm-up sets</li>');
      if(!x.warm && !head){ head=true; if(wi) rows.push('<li class="div">Working sets</li>'); }
      if(j) rows.push(`<li class="rst"><div class="rest">Rest <b>${x.pressed?'':'~'}${fmtClock(x.start-timed[j-1].end)}</b></div></li>`);
      rows.push(`<li class="done"><div class="set rec done"><div class="n">${x.warm?'W'+(++wi):++si}</div><div class="val">${setVal(e,x)}</div><div class="btns"><span class="sdur">${x.est?'~':''}${fmtClock(x.end-x.start)}${perRep(e,x)}</span><span class="okm">✓</span></div></div></li>`);
    });
    const n=exs[i+1]; if(e.end && n && n.arrived){ mv+=Math.max(0, n.arrived-e.end); rows.push(`<li class="mvl"><div class="mvrow">Moving <b>${fmtClock(n.arrived-e.end)}</b></div></li>`); }
  });
  if(s.stretch&&s.stretch.did&&s.stretch.end) rows.push(`<li class="ev">Stretching <b>${fmtDur(s.stretch.end-s.stretch.start)}</b></li>`);
  if(s.end) rows.push(`<li class="ev">Finished <b>${fmtTime(s.end)}</b></li>`);
  const tot=wu+mv+ar+st+rs||1, seg=(k,v,l)=>v>0?`<div class="${k}" style="flex:${v/tot}">${v/tot>.1?l:''}</div>`:'';
  return `<div class="strip">${seg('k-wu',wu,'Warm-up')}${seg('k-st',st,'Sets')}${seg('k-rs',rs,'Rest')}${seg('k-ar',ar,'Setup')}${seg('k-mv',mv,'Moving')}</div>
    <div class="legend" style="margin:6px 0 4px"><span><i class="k-wu"></i>Warm-up ${fmtDur(wu)}</span><span><i class="k-st"></i>Sets ${fmtDur(st)}</span><span><i class="k-rs"></i>Rest ${fmtDur(rs)}</span><span><i class="k-ar"></i>Setup ${fmtDur(ar)}</span><span><i class="k-mv"></i>Moving ${fmtDur(mv)}</span></div>
    <ol class="tl">${rows.join('')}</ol>`;
}
function sessionDetail(s){
  if(s.status==='skip'){
    const k=s.skip||{};
    return `<div class="card"><h2 style="color:var(--bad)">✕ ${esc(s.type)} skipped</h2><table class="tbl"><tr><td>Reason</td><td>${esc(k.reason)}</td></tr><tr><td>Instead</td><td>${esc(k.instead||'—')}</td></tr><tr><td>Time gained</td><td>${k.minutes?esc(k.minutes)+' min':'—'}</td></tr><tr><td>Worth it</td><td>${k.worth!=null?['Not at all','No','Neutral','Yes','Clearly'][k.worth+2]:'—'}</td></tr><tr><td>Note</td><td>${esc(k.note||'—')}</td></tr></table>
      <button class="link" style="color:var(--bad)" data-act="delSes" data-id="${s.id}">Delete entry</button></div>`;
  }
  const p=s.pre||{}, q=s.post||{}, h=s.health;
  if(s.activity) return `<div class="card"><h2>${esc(s.activity)} <span class="pill">activity</span></h2>
    <div class="small ink2">${s.start&&s.end?`${fmtTime(s.start)}–${fmtTime(s.end)} · ${fmtDur(s.end-s.start)}`:'No time given'}</div>
    ${h? `<p class="small">👟 ${h.steps} steps · 🔥 ${h.kcal} kcal · ❤️ avg ${h.hrAvg||'—'} / max ${h.hrMax||'—'}</p>` : sesHealthBtns(s)}
    <button class="link" style="color:var(--bad)" data-act="delSes" data-id="${s.id}">Delete activity</button></div>`;
  const exs = (s.exercises||[]).some(e=>e.arrived)? recordTimeline(s) : (s.exercises||[]).map(e=>{
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
    <table class="tbl" style="margin-top:8px"><tr><td>Energy before</td><td>${p.energy||'—'}</td><td>Feeling</td><td>${q.feeling||'—'}</td></tr><tr><td>Motivation</td><td>${p.motivation||'—'}</td><td></td><td></td></tr><tr><td>Soreness</td><td>${p.soreness||'—'}</td><td>RPE</td><td>${q.rpe||'—'}</td></tr><tr><td>Sleep</td><td>${p.sleep||'—'}</td><td>Power</td><td>${q.power||'—'}</td></tr></table>
    ${h? `<p class="small">👟 ${h.steps} steps · 🔥 ${h.kcal} kcal · ❤️ avg ${h.hrAvg||'—'} / max ${h.hrMax||'—'}</p>` : sesHealthBtns(s)}
    ${s.notes?`<p class="small">${esc(s.notes)}</p>`:''}
    <button class="link" style="color:var(--bad)" data-act="delSes" data-id="${s.id}">Delete workout</button></div>`;
}
// "Get" runs the Shortcut; "Paste" is always there (also after the app was closed in between) and targets this workout
function sesHealthBtns(s){
  if(!s.start || !s.end) return '';
  const waiting = S.healthPending && S.healthPending.target===s.id;
  return `<div class="grid2" style="margin-top:8px"><button class="ghost big" data-act="healthSes" data-id="${s.id}">Get Apple Health data</button>
    <button class="${waiting?'primary':'ghost'} big" data-act="healthPaste" data-id="${s.id}">Paste result</button></div>`;
}
let dayOpen=null;
function daySheet(date){
  const list = sortSessions(S.sessions.filter(s=>s.date===date)), today=iso();
  const mv = S.moves.find(m=>m.from===date || m.to===date);
  let planHtml = mv? `<div class="card" style="border-color:var(--warn)"><h3>↔ Moved workout</h3>
    <p class="small ink2" style="margin:0">Training moved from <b>${fmtDate(mv.from)}</b> to <b>${fmtDate(mv.to)}</b>${mv.ok===false?' (more days in a row than your limit)':''}.</p>
    <button class="link" data-act="undoMove" data-v="${mv.id}">Undo move</button></div>` : '';
  const gymList = list.filter(isGym);
  if(date>=today && !gymList.length && !(mv && mv.from===date)){
    const pin = S.planPins[date]==='train'? '' : S.planPins[date], auto = autoKeyFor(date);
    const opts = [['', `Auto${auto?' ('+keyLabel(auto)+')':''}`], ...PLAN_KEYS.map(k=>[k,keyLabel(k)]), ['rest','Rest']];
    const p = planFor(date);
    planHtml += `<div class="card"><h3>Plan for this day</h3>
      <div class="chips">${opts.map(([k,l])=>`<button class="chip ${(pin||'')===k?'on':''}" data-act="pin" data-d="${date}" data-v="${k}">${k?'📌 ':''}${esc(l)}</button>`).join('')}</div>
      <p class="small muted" style="margin:8px 0 0">${pin? 'Fixed: this day keeps this plan, whatever happens before it.' : 'Auto follows your split and shifts when you skip or train something else.'}</p>
      ${p && p.key && p.key!=='rest' && !mv? `<button class="big mvbtn" style="margin-top:8px" data-act="moveOpen" data-v="${date}">↔ Move this workout to a rest day</button>` : ''}</div>`;
  } else if(date<today && !gymList.length && unaccountedDays().includes(date)){
    planHtml += `<div class="card" style="border-color:var(--warn)"><h3>Planned training, nothing logged</h3><div class="grid3">
      <button class="no" data-act="missSkip" data-v="${date}">Skipped</button><button data-act="manualOpen" data-v="${date}">Trained</button><button class="mvbtn" data-act="moveOpen" data-v="${date}">Moved</button></div>
      <button class="link" style="font-size:12px" data-act="missRest" data-v="${date}">It was planned wrong, it was a rest day</button></div>`;
  }
  return `<div class="row between"><h2 style="margin:0">${fmtDate(date)} ${date.slice(0,4)}</h2><button class="icon" data-act="closeModal">✕</button></div>
  <div style="margin-top:12px">${planHtml}${list.map(sessionDetail).join('') || (planHtml && date>=today? '' : `<div class="empty">${isRestDay(date)?'Rest day. ':''}Nothing logged.</div>`)}</div>
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
  const done = ses.filter(s=>s.status==='done' && isGym(s)), skips = ses.filter(s=>s.status==='skip');
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
let tplEdit='Push', rotCustom=false;
// Template editor in Settings: works on a copy (tplEd.t); "Save" makes ONE new version. e._orig = name before editing (for renames).
let tplEd=null;
function tplEdStart(){ const t=JSON.parse(JSON.stringify(S.templates[tplEdit])); t.exercises.forEach(e=>e._orig=e.name); tplEd={key:tplEdit, t, changed:false}; }
function tplEditorHtml(){
  const t=tplEd.t, v=S.templates[tplEd.key].v||1;
  const opt=(list,cur)=>list.map(([k,l])=>`<option value="${esc(k)}" ${k===cur?'selected':''}>${esc(l)}</option>`).join('');
  const exs=t.exercises.map((e,i)=>`<div class="tedit">
    <div class="row between"><b class="small muted">${i+1}.</b><span class="row" style="gap:4px">
      <button class="icon" data-act="teMove" data-i="${i}" data-v="-1" ${i?'':'disabled'} aria-label="Earlier">↑</button>
      <button class="icon" data-act="teMove" data-i="${i}" data-v="1" ${i<t.exercises.length-1?'':'disabled'} aria-label="Later">↓</button>
      <button class="icon" style="color:var(--bad)" data-act="teDel" data-i="${i}" aria-label="Remove">✕</button></span></div>
    <label class="f">Name</label><input data-te="${i}" data-k="name" value="${esc(e.name)}">
    ${e._orig && e._orig!==e.name? `<p class="small" style="color:var(--warn);margin:4px 0 0">Renamed from “${esc(e._orig)}”: history is linked by exact name.</p>`:''}
    <label class="f">Info (new lines allowed)</label><textarea class="auto" rows="1" data-te="${i}" data-k="info" placeholder="e.g. Setting 7 · elbows down">${esc(e.info||'')}</textarea>
    <div class="grid2"><div><label class="f">Type</label><select data-te="${i}" data-k="kind">${opt(Object.entries(KINDS),e.kind)}</select></div>
      <div><label class="f">Muscle</label><select data-te="${i}" data-k="muscle">${opt(MUSCLES.map(m=>[m,m]),e.muscle)}</select></div></div>
    <div class="grid3"><div><label class="f">Warm-up sets</label><input inputmode="numeric" data-te="${i}" data-k="warm" value="${e.warm||0}"></div>
      <div><label class="f">Sets</label><input inputmode="numeric" data-te="${i}" data-k="sets" value="${e.sets}"></div>
      <div><label class="f">Target</label><input data-te="${i}" data-k="target" value="${esc(e.target)}"></div>
      <div><label class="f">Rest (s)</label><input inputmode="numeric" data-te="${i}" data-k="rest" value="${e.rest}"></div>
      <div><label class="f">Start kg</label><input inputmode="decimal" data-te="${i}" data-k="w" value="${e.w?fw(e.w):''}" placeholder="last time"></div></div>
  </div>`).join('');
  return `<div class="row between"><h3 style="margin:0">Editing ${esc(keyLabel(tplEd.key))} (v${v} → v${v+1})</h3></div>
    <label class="f">Warm-up (new lines allowed)</label><textarea class="auto" rows="1" data-te="wu" data-k="text">${esc(t.warmup.text||'')}</textarea>
    <label class="f">Warm-up minutes</label><input inputmode="numeric" data-te="wu" data-k="minutes" value="${t.warmup.minutes||0}">
    ${exs||'<div class="empty">No exercises.</div>'}
    <button class="ghost big" style="margin-top:10px" data-act="teAdd">+ Add exercise</button>
    <div class="grid2" style="margin-top:10px"><button class="big" data-act="teCancel">Cancel</button><button class="primary big" data-act="teSave">Save as v${v+1}</button></div>
    <p class="small muted">v${v} stays in the version list. Same name in two workouts = same exercise history.</p>`;
}
function tplEdInput(t){
  const i=t.dataset.te, k=t.dataset.k, tp=tplEd.t; tplEd.changed=true;
  if(i==='wu'){ tp.warmup[k] = k==='minutes'? Math.max(0,parseInt(t.value)||0) : t.value; return; }
  const e=tp.exercises[+i]; if(!e) return;
  if(['warm','rest'].includes(k)) e[k]=Math.max(0,parseInt(t.value)||0);
  else if(k==='sets') e[k]=Math.max(1,parseInt(t.value)||1);
  else if(k==='w') e[k]=num(t.value);
  else e[k]=t.value;
}
function tplEdSave(){
  const key=tplEd.key, tp=tplEd.t;
  if(tp.exercises.some(e=>!String(e.name).trim())){ toast('Every exercise needs a name'); return; }
  const renames=tp.exercises.filter(e=>e._orig && e._orig!==e.name.trim()).map(e=>[e._orig, e.name.trim()]);
  tp.exercises.forEach(e=>{ e.name=String(e.name).trim(); e.info=String(e.info||'').trim(); delete e._orig; });
  tplChange(key, 'Edited in Settings', t=>{ t.warmup={text:String(tp.warmup.text||'').trim(), minutes:tp.warmup.minutes||0}; t.exercises=tp.exercises; });
  // keep shared exercises linked: offer to rename them in the other workouts too
  renames.forEach(([o,n])=>{ const others=Object.keys(S.templates).filter(k=>k!==key && S.templates[k].exercises.some(x=>x.name===o));
    if(others.length && confirm(`“${o}” is also in ${others.map(keyLabel).join(', ')}. Rename it there too, so it stays one exercise with one history?`))
      others.forEach(k=>tplChange(k, `Renamed “${o}” → “${n}”`, t=>t.exercises.forEach(x=>{ if(x.name===o) x.name=n; }))); });
  tplEd=null; save(); render(); toast(`${keyLabel(key)} v${S.templates[key].v} is in use now`);
}
function autoGrow(el){ el.style.height='auto'; el.style.height=(el.scrollHeight+2)+'px'; }
function growAll(root){ (root||document).querySelectorAll('textarea.auto').forEach(autoGrow); }
function viewSettings(){
  const st=S.settings, tpl=S.templates[tplEdit];
  const tabs=WORKOUTS.map(w=>`<button class="${tplEdit===w.key?'on':''}" data-act="tplTab" data-v="${w.key}">${w.key==='PullBoulder'?'Boulder':w.label}</button>`).join('');
  const vers=(S.tplHistory[tplEdit]||[]).slice().reverse();
  const rows=tpl.exercises.map((e,i)=>`<div class="list-item" style="display:block;padding:8px 0">
    <div class="row between"><b>${i+1}. ${esc(e.name)}</b><span class="small muted">${esc(e.muscle||'')}</span></div>
    ${e.info?`<div class="small ink2 pre">ⓘ ${esc(e.info)}</div>`:''}
    <div class="small muted">${e.warm?e.warm+' warm-up + ':''}${e.sets} × ${esc(e.target)} · ${esc(KINDS[e.kind]||e.kind)} · rest ${e.rest} s${e.w?' · start '+fw(e.w)+' kg':''}</div></div>`).join('');
  return `<h1>Settings</h1>
  <div class="card"><h2>Profile</h2>
    <label class="f">Name (stored on this device only)</label><input data-prof="name" value="${esc(S.profile.name)}">
    <button class="link" data-act="obRestart">Run the welcome wizard again</button></div>
  <div class="card"><h2>Training plan</h2>
    <label class="f">Split (repeats on your training days)</label>
    <div class="chips">${SPLIT_PRESETS.map(p=>`<button class="chip ${p.order.join()===st.rotation.join()?'on':''}" data-act="splitPreset" data-v="${p.order.join(',')}">${esc(p.label)}</button>`).join('')}
      <button class="chip ${rotCustom||!SPLIT_PRESETS.some(p=>p.order.join()===st.rotation.join())?'on':''}" data-act="splitCustom">Custom</button></div>
    ${rotCustom||!SPLIT_PRESETS.some(p=>p.order.join()===st.rotation.join())? `<div style="margin-top:8px">${st.rotation.map((t,i)=>`<div class="row" style="margin-top:6px"><span class="small muted" style="width:18px">${i+1}.</span>
      <select data-rot="${i}">${TYPES.map(x=>`<option ${x===t?'selected':''}>${x}</option>`).join('')}</select>
      <button class="icon" data-act="rotUp" data-i="${i}">↑</button>${st.rotation.length>1?`<button class="icon" data-act="rotDel" data-i="${i}" style="color:var(--bad)">✕</button>`:''}</div>`).join('')}
      <button class="small ghost" style="margin-top:8px" data-act="rotAdd">+ Add day to split</button></div>` : ''}
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
    <label class="f">Weight increase when all sets hit the top of the rep range (kg)</label><input data-set="progStep" inputmode="decimal" value="${fw(st.progStep)}">
    <label class="f">Keep the screen on during a workout</label>
    <div class="chips"><button class="chip ${st.keepAwake?'on':''}" data-act="keepAwake" data-v="1">On</button><button class="chip ${!st.keepAwake?'on':''}" data-act="keepAwake" data-v="0">Off</button></div>
    <p class="small muted" style="margin:4px 0 0">So you don't have to unlock the phone between sets.</p>
    <label class="f">Rest-timer sound</label>
    <div class="chips"><button class="chip ${st.sound?'on':''}" data-act="sound" data-v="1">On</button><button class="chip ${!st.sound?'on':''}" data-act="sound" data-v="0">Off</button></div>
    <label class="f">Theme</label>
    <div class="chips">${['auto','light','dark'].map(t=>`<button class="chip ${st.theme===t?'on':''}" data-act="theme" data-v="${t}">${t[0].toUpperCase()+t.slice(1)}</button>`).join('')}</div>
  </div>
  <div class="card"><h2>Workout templates</h2>
    <p class="small ink2" style="margin-top:0">Tap ✎ Edit to change a workout here, or use ⚙ / ＋ during a workout. Every saved change is a new version; the older ones stay below.</p>
    <div class="seg">${tabs}</div>
    ${tplEd? tplEditorHtml() : `<div class="row between"><h3 style="margin:0">${esc(keyLabel(tplEdit))} v${tpl.v||1} <span class="pill" style="color:var(--accent)">in use</span></h3><button class="soft" data-act="teStart">✎ Edit</button></div>
    <p class="small ink2 pre" style="margin:4px 0 0"><b>Warm-up</b> (${tpl.warmup.minutes||0} min): ${esc(tpl.warmup.text)||'—'}</p>
    ${rows||'<div class="empty">No exercises.</div>'}`}
    <h3 style="margin-top:14px">Versions</h3>
    ${vers.map(h=>`<div class="list-item"><b style="min-width:30px">v${h.v}</b><div style="flex:1;min-width:0"><div class="small">${esc(h.note||'')}</div><div class="small muted">${new Date(h.at).toLocaleString('de-CH',{dateStyle:'short',timeStyle:'short'})} · ${h.tpl.exercises.length} exercises</div></div>
      ${h.v===(tpl.v||1)?'<span class="pill">in use</span>':`<button class="small" data-act="tplUse" data-v="${h.v}">Use again</button>`}</div>`).join('')}
    <button class="ghost big" style="margin-top:10px" data-act="tplPaste">Paste a template as new version</button>
    <p class="small muted">Copy a template text (JSON with an "exercises" list) first. The current version stays in the list.</p>
  </div>
  <div class="card"><h2>Workout in progress</h2>
    <p class="small ink2" style="margin-top:0">A running workout is saved on this phone with every tap. Closing the app, a reload, an update or no signal lose nothing.</p>
    <label class="f">Also offer an iCloud copy of the running workout every</label>
    <div class="chips">${[[0,'Off'],[15,'15 min'],[30,'30 min'],[60,'60 min']].map(([m,l])=>`<button class="chip ${st.wipSave===m?'on':''}" data-act="wipSave" data-v="${m}">${l}</button>`).join('')}</div>
    <p class="small muted">A “Save” button appears in the workout; it runs your Gym Save shortcut.</p>
    <label class="f">Default rest for new exercises</label>
    <div class="chips">${[45,60,90,120].map(s=>`<button class="chip ${st.defaultRest===s?'on':''}" data-act="defRest" data-v="${s}">${s} s</button>`).join('')}</div>
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
        <li><b>Text</b> action with four lines: <code>steps=</code><i>Steps</i>, <code>kcal=</code><i>Kcal</i>, <code>hrAvg=</code><i>HRavg</i>, <code>hrMax=</code><i>HRmax</i> → <b>Copy to Clipboard</b>. (Use Text, not Dictionary: a copied Dictionary arrives empty in the app.)</li>
        <li>Back in the app, tap <b>Paste Apple Health result</b>. Allow Health access on the first run.</li>
      </ol></details>
  </div>
  <div class="card"><h2>App version</h2>${versionHtml()}</div>
  <div class="card row between"><div><h2 style="margin:0">Manual</h2><span class="small muted">How everything works, searchable</span></div><button class="soft" data-act="manual">Open</button></div>
  <div class="card"><h2>Data</h2>
    <p class="small ink2">Extra safety: copy all data as text and paste it into a note (Notes app). You can restore it from there the same way.</p>
    <div class="grid2"><button data-act="copyAll">📋 Copy all data</button><button data-act="pasteAll">Restore from clipboard</button></div>
    <div class="grid2" style="margin-top:8px"><button data-act="export">Export backup file</button><button data-act="importBtn">Import backup file</button></div>
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

/* ================= manual (ⓘ, top right) ================= */
// Tree: sections → topics. "where" tells the user where to find it in the app.
const MANUAL = [
  {id:'start', title:'🏠 Today', items:[
    {id:'today', title:'Today screen', where:'Today', text:'Shows today’s plan (or "Rest"), Start workout, Log skip and "Move today’s workout". Once you trained today, the big title is your NEXT workout with its day (e.g. "Push – On Thursday"), and only a small "+ Another workout or activity" link stays. Below: the calendar for this and next week, your skip counter and bodyweight. Pull down at the top to refresh (also checks for a new version).'},
    {id:'activity', title:'Other activities (golf, swimming …)', where:'Start workout → ⛳ Other activity', text:'Log anything that is not a gym workout: name, minutes, when you finished. It shows as ○ in the calendar and in History (with Apple Health data if you like), but never changes your training plan or counts as a planned workout.'},
    {id:'cal2w', title:'2-week calendar', where:'Today → This & next week', text:'Green = trained, red = skipped, amber ↔ = moved, dashed outline = planned (upcoming), red dashed "LOG" = planned training day in the past without an entry. 📌 = day fixed by hand. Tap any day to see, plan, move or log it. "📅 Month" opens the month view.'},
    {id:'tolog', title:'"To log" days (red dashed)', where:'Today → "days to log" card · calendars', text:'Every past training day of your plan needs an entry: Workout, Skip or Moved. Until then it is marked red dashed with "LOG". This starts at your first ever entry, so the past always adds up. If the plan itself was wrong, choose "it was a rest day".'},
    {id:'bw', title:'Bodyweight', where:'Today → Bodyweight', text:'Enter your weight; the chart is in Stats. Bodyweight exercises (pull-ups, dips) use it for the total kg.'},
  ]},
  {id:'plan', title:'📅 Training plan', items:[
    {id:'split', title:'Split & rotation', where:'Settings → Training plan', text:'Your split (e.g. Push → Legs → Pull) repeats forever on your training days. Presets or your own order. The rotation always continues from the last workout you actually did.'},
    {id:'days', title:'Training days & rest days', where:'Settings → Training plan → Training days', text:'Tap the weekdays you train. The others are rest days.'},
    {id:'boulder', title:'Bouldering every 2nd Pull', where:'Settings → Training plan', text:'If on, every second Pull day becomes "Pull + Boulder" with its own exercises.'},
    {id:'fixed', title:'Fix a day by hand (📌)', where:'Tap a future day → Plan for this day', text:'Choose Push, Legs, Pull, Pull + Boulder or Rest. A fixed day stays as it is, whatever happens before it. "Auto" releases it. Fixing a day by hand also replaces a move on that day.'},
    {id:'skip', title:'Skip', where:'Today → Log skip · or tap a past day → ✕ Skip', text:'Counts as an official skip with reason, what you did instead, time gained and "worth it?". The skipped workout is not used up: it moves to the next training day and everything after shifts by one training day. (Can be changed in Settings.)'},
    {id:'move', title:'Move a workout', where:'Today → "Move today’s workout" · tap a day → ↔ Move · past day → ↔ Moved', text:'Pick a day up to 3 days before/after. The original day becomes a rest day; the new day becomes a training day with the NEXT workout of your rotation (a 📌 fixed workout travels along). If the new day already was a training day, the following days shift by one. Not a skip. If the new day is today or later nothing is logged yet: you train (or skip) it normally. If it is in the past you say what you trained. "Undo move" restores the exact previous plan.'},
    {id:'inrow', title:'Too many days in a row', where:'Move sheet · Today calendar · Settings → Max training days in a row', text:'The limit comes from your week (e.g. Mo-Tu-We + Fr-Sa = 3) or can be set by hand. Moves that exceed it show ⚠ and "Move anyway"; Today warns about upcoming runs that are too long. It never blocks you.'},
    {id:'other', title:'Doing another workout than planned', where:'Start workout → dropdown', text:'Just pick it. The plan for the next days adjusts automatically.'},
  ]},
  {id:'wo', title:'🏋️ Workout', items:[
    {id:'startwo', title:'Start a workout', where:'Today → Start workout', text:'Choose what you train (planned one is preselected) and when you started (now or X min ago).'},
    {id:'wizard', title:'One exercise per screen', where:'Workout tab', text:'First a short check-in (energy, motivation, soreness of the muscles this workout uses, sleep), then "Start workout" starts the clock and the warm-up, then always exactly one exercise on the screen. To look at the previous or next exercise, scroll past the top or bottom edge twice: the first pull arms the arrow ("Pull again for …"), the second one switches. "Previous" only appears while you pull down at the top. ‹ top left goes back in one tap. "Back to current" returns to where you are. The screen stays on during a workout (Settings → General).'},
    {id:'sets', title:'Start and ✓ on each set', where:'Workout → exercise', text:'Tap ▶ Start when you begin a set and ✓ when it is done. ✓ without Start counts the set from the end of the rest countdown (shown with ~). Tap a set to change kg and reps; +/− also changes the following sets with the same value. Tap a green ✓ to undo it. A done set shows its time and seconds per rep (e.g. 4s/rep). "+ Add a set" works also after the exercise is finished: it brings you back to it.'},
    {id:'prog', title:'Go heavier (progression hint)', where:'Workout → under the exercise name', text:'If last time every working set reached the top of the rep range (e.g. 3 × 12 at 8-12), a green hint suggests more weight. Tap it to put +1 kg (changeable in Settings → General) on all working sets.'},
    {id:'warmset', title:'Warm-up sets', where:'Workout → above "Working sets"', text:'Every weight exercise starts with one warm-up set at 30–50 % of the working weight, rounded so you only stack big plates on top (100 kg → 50 kg, 22.5 kg → 10 kg). It follows the first working set when you change that weight. Change the number of warm-up sets with ⚙.'},
    {id:'warmup', title:'Warm-up & no tabs during a workout', where:'Workout → first screen', text:'The warm-up looks like an exercise: what to do is in the line under the title, ⚙ changes it for today or for the template. While a workout runs, the bottom tabs are hidden; they come back after saving or discarding the workout.'},
    {id:'rest', title:'Rest', where:'Workout → between the sets', text:'Starts by itself with ✓ and ends when you tap Start on the next set. There is no stop: once the rest time is over it turns orange, beeps and counts on. The rest time of an exercise is changed with ⚙.'},
    {id:'moving', title:'Moving to the next exercise', where:'Workout → after the last set', text:'✓ on the last set (or Skip / Move on) starts "Moving to the next exercise". At the next machine tap "I\'m at the machine": that is when the exercise starts. The time until the first set is setting up. If you press nothing at all on an exercise, all its sets count and the time is split evenly.'},
    {id:'gear', title:'⚙ Change an exercise / the template', where:'Workout → ⚙ next to the exercise name', text:'Name, info under the name (several lines possible), warm-up sets, working sets, target and rest. "This workout only" or "Also update template": today\'s workout uses the change right away, and all template changes of one workout become ONE new version when the workout ends. "Remove from template" works the same way. Write "single handedly" into the name for one-arm or one-leg exercises.'},
    {id:'mas', title:'Move · Add · Skip', where:'Workout → ⇅ next to the name · ＋ top right · Skip in the bottom bar', text:'Move: machine taken? Pick another exercise to do next (or right away if you haven\'t started). Add: a new exercise after the current one, for today only or also in the template. Skip: ticked sets still count, moving starts.'},
    {id:'earlier', title:'Warm-up finished earlier…', where:'Workout → warm-up', text:'Forgot to tap "Warm-up done"? Pick how many minutes ago. Stretching has the same option.'},
    {id:'endearly', title:'End workout early', where:'Workout → bottom of the exercise', text:'Ends the workout (with "finished X min ago"). The exercise you are at counts with its ticked sets, the remaining ones are marked as skipped.'},
    {id:'stretch', title:'Stretching & time pressure', where:'After the last exercise', text:'Green Yes / red No for stretching (timed if yes). Then: time-limited or no plans after. Both are tracked in Stats.'},
    {id:'reload', title:'Nothing gets lost', where:'Settings → Workout in progress', text:'The workout is saved on the phone with every tap and only times are stored, so closing the app, a reload, an update or no signal continue exactly where you were. Every 15 min (changeable) a "Save" button offers an iCloud copy of the running workout.'},
    {id:'record', title:'Finished workout', where:'History → tap a workout', text:'The whole workout on one line: every set with its time, rests, setting up and moving, plus a bar that splits the time into warm-up, sets, rest, setup and moving.'},
  ]},
  {id:'hist', title:'📖 History & days', items:[
    {id:'dayd', title:'Day details', where:'Tap any day', text:'Shows the workout with times, sets and "▲ +2.5 kg vs. last time", skips with reason, moves (with Undo), and the plan for upcoming days.'},
    {id:'past', title:'Add something afterwards', where:'Tap a past day → + Add entry', text:'Switch between 💪 Workout, ✕ Skip and ↔ Moved. Reasons only appear for skips.'},
    {id:'month', title:'Month view', where:'Today → 📅 Month · History · Stats', text:'Whole month with the same colors, plus workouts, skips, moves and adherence for that month. ‹ › switches months.'},
  ]},
  {id:'stats', title:'📊 Stats', items:[
    {id:'muscle', title:'Muscle progress', where:'Stats', text:'Per muscle group and exercise: heaviest weight (or longest hold) first vs. latest in the chosen period.'},
    {id:'moved', title:'Moved workouts', where:'Stats → Moved workouts', text:'How often you moved, share of planned days, which weekday you move from most, moves that broke your limit, recent list.'},
    {id:'opp', title:'Skips & opportunity cost', where:'Stats', text:'Skip reasons, estimated missed volume and sets, time used elsewhere and your "worth it?" average.'},
    {id:'habits', title:'Stretching, time pressure, feeling', where:'Stats', text:'Stretch rate, time-limited vs. relaxed workouts, feeling and energy vs. performance, Apple Health averages, bodyweight chart.'},
  ]},
  {id:'safe', title:'☁️ Backup & data', items:[
    {id:'where', title:'Where your data is', where:'—', text:'Only on this iPhone (in the app) and in your own iCloud Drive (Gym/data.json). Nothing goes to any server; the app code comes from GitHub, your data never does.'},
    {id:'icloud', title:'iCloud backup (Gym Save)', where:'Settings → iCloud Drive backup', text:'After every workout, skip, move and bodyweight entry the app runs the Shortcut "Gym Save", which saves data.json (latest) and a dated copy in Gym/backups. Setup steps are in Settings.'},
    {id:'check', title:'✓ Check backup', where:'Today banner after a save · Settings → Check backup', text:'Pick Gym/data.json. The app reads it back and checks: is it the newest save, are all workouts/skips/moves/bodyweight/plan included, nothing changed since. Shows a checklist; if something is missing: save again.'},
    {id:'notes', title:'Copy all data (Notes)', where:'Settings → Data → 📋 Copy all data', text:'Copies everything as text; paste it into a note. "Restore from clipboard" brings it back (copy the note’s text first).'},
    {id:'restore', title:'Restore / new phone', where:'Welcome screen or Settings → Restore from data.json', text:'Pick data.json (or a dated backup). Replaces the data on this device.'},
  ]},
  {id:'health', title:'❤️ Apple Health', items:[
    {id:'hs', title:'Steps, calories, heart rate', where:'Finish workout → Get Apple Health data · or a day’s details', text:'Runs the Shortcut "Gym Health" with the workout time. Back in the app tap "Paste Apple Health result". If the clipboard can\'t be read, a box opens: long-press → Paste → Add. The Shortcut must copy TEXT (steps=…, kcal=…, hrAvg=…, hrMax=…), not a Dictionary. Calories and heart rate need the Apple Watch. Setup in Settings → Apple Health.'},
  ]},
  {id:'app', title:'⚙️ App & updates', items:[
    {id:'upd', title:'Updates & ⟳ Refresh', where:'Settings → App version · banner "New version available"', text:'The app checks for a new version on every start. When one is found, tap "⟳ Refresh". Your data and a running workout stay. Works offline with the last version.'},
    {id:'rollback', title:'Go back to the previous version', where:'Settings → App version', text:'If a new version misbehaves, go back; updates pause until you resume them.'},
    {id:'templates', title:'Templates & versions', where:'Settings → Workout templates', text:'Each workout\'s exercises and all its versions. ✎ Edit changes warm-up and exercises (name, info, type, muscle, sets, target, rest, start kg, order, remove, add); Save makes one new version. Renaming an exercise that is also in another workout offers to rename it there too, so the history stays linked. Changes during a workout (⚙ / Add) become one version at the end of the workout. "Use again" brings an older version back; "Paste a template" turns a copied template text into a new version.'},
    {id:'wizardagain', title:'Welcome wizard again', where:'Settings → Profile', text:'Runs the setup again (name, plan, backup). Your data stays.'},
  ]},
];
let manualQuery='';
function manualSheet(focus){
  const q = manualQuery.trim().toLowerCase();
  const hl = s => { const e=esc(s); if(!q) return e; return e.replace(new RegExp('('+q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+')','gi'),'<mark>$1</mark>'); };
  const match = it => !q || (it.title+' '+it.text+' '+it.where).toLowerCase().includes(q);
  let hits=0;
  const tree = MANUAL.map(sec=>{
    const items = sec.items.filter(match); if(!items.length) return '';
    hits += items.length;
    const open = q || focus===sec.id || items.some(i=>i.id===focus);
    return `<details class="mtree" ${open?'open':''}><summary><b>${esc(sec.title)}</b> <span class="small muted">${items.length}</span></summary>
      ${items.map(it=>`<details class="mitem" id="man-${it.id}" ${q||focus===it.id?'open':''}><summary>${hl(it.title)}</summary>
        <div class="small muted">📍 ${hl(it.where)}</div><p class="small ink2" style="margin:4px 0 8px">${hl(it.text)}</p></details>`).join('')}</details>`;
  }).join('');
  return `<div class="row between"><h2 style="margin:0">ⓘ Manual</h2><button class="icon" data-act="closeModal">✕</button></div>
    <input id="manQ" placeholder="Search, e.g. move, skip, backup…" value="${esc(manualQuery)}" style="margin:10px 0" autocomplete="off">
    <div id="manTree">${tree || '<div class="empty">Nothing found.</div>'}</div>
    ${q?`<p class="small muted">${hits} topic${hits===1?'':'s'} found</p>`:''}`;
}
function openManual(focus){
  manualQuery=''; openModal(manualSheet(focus));
  if(focus){ const el=document.getElementById('man-'+focus); if(el) el.scrollIntoView({block:'center'}); }
}

/* ================= modal ================= */
let lockY=null;
function bodyLock(on){
  const b=document.body;
  if(on && lockY==null){ lockY=window.scrollY; Object.assign(b.style,{position:'fixed', top:-lockY+'px', left:'0', right:'0'}); }
  else if(!on && lockY!=null){ const y=lockY; lockY=null; Object.assign(b.style,{position:'', top:'', left:'', right:''}); window.scrollTo(0,y); }
}
function openModal(html){ $('#modal').innerHTML=`<div class="modal" data-act="modalBg"><div class="sheet">${html}</div></div>`; growAll($('#modal')); bodyLock(true); }
function closeModal(){ if(document.activeElement && document.activeElement.blur) document.activeElement.blur(); $('#modal').innerHTML=''; dayOpen=null; woPull=null; sh=null; bodyLock(false); }

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
    case 'startOpen': if(S.active){ go('workout'); break; } startMode='gym'; openModal(startSheet()); break;
    case 'startMode': startMode=v; openModal(startSheet()); break;
    case 'acPick': $('#acName').value=v; break;
    case 'acSave': { const name=$('#acName').value.trim(), min=Math.max(0,parseInt($('#acMin').value)||0); if(!name){ toast('What did you do?'); break; }
      const end=Date.now()-(+$('#acAgo').value)*60000, start=min? end-min*60000 : null;
      S.sessions.push({id:uid(), date:iso(new Date(start||end)), type:'Other', activity:name, status:'done', start, end:start?end:null, exercises:[], notes:''});
      save(); closeModal(); render(); toast(`${name} saved`); if(S.settings.icloudAuto) saveToICloud(); break; }
    case 'startGo': startWorkout($('#stKey').value, +$('#stAgo').value); break;
    case 'skipOpen': { const tp=todayPlan(); skipDraft=newDraft(tp.key && tp.key!=='rest'? {type:keyType(tp.key)} : {}); openModal(skipSheet()); break; }
    case 'missSkip': skipDraft=newDraft({mode:'skip', showMode:true, date:v}); openModal(skipSheet()); break;
    case 'manualOpen': skipDraft=newDraft({mode:'done', showMode:true, date:v||iso()}); openModal(skipSheet()); break;
    case 'entMode': readSkipInputs(); skipDraft.mode=v; openModal(skipSheet()); break;
    case 'moveOpen': skipDraft=newDraft({mode:'move', showMode:v<iso(), date:v, key:plannedKeyOn(v)}); openModal(skipSheet()); break;
    case 'mvPick': readSkipInputs(); skipDraft.moveTo=v; openModal(skipSheet()); break;
    case 'mvSave': { readSkipInputs(); const d=skipDraft, c=moveCandidates(d.date).find(x=>x.date===d.moveTo); if(!c) break;
      doMove(d.date, c.date);
      // only a day that is already over can be logged right away; today/future days are trained (or skipped) as usual
      if(c.date<iso() && d.key){ const w=WORKOUTS.find(x=>x.key===d.key)||WORKOUTS[0]; S.sessions.push({id:uid(), date:c.date, type:w.type, boulder:w.boulder, status:'done', exercises:[], notes:'Moved from '+fmtDate(d.date)}); }
      save(); closeModal(); render(); toast(`Moved ${fmtDate(d.date)} → ${fmtDate(c.date)}`);
      if(S.settings.icloudAuto) saveToICloud(); break; }
    case 'undoMove': if(confirm('Undo this move? Both days go back to the normal plan.')){ undoMove(v); save(); closeModal(); render(); } break;
    case 'entSave': { readSkipInputs(); const w=WORKOUTS.find(x=>x.key===skipDraft.key)||WORKOUTS[0];
      S.sessions.push({id:uid(), date:skipDraft.date, type:w.type, boulder:w.boulder, status:'done', exercises:[], notes:skipDraft.note});
      save(); closeModal(); render(); toast(`${w.label} added for ${fmtDate(skipDraft.date)}`);
      if(S.settings.icloudAuto) saveToICloud(); break; }
    case 'missRest': { const m=S.moves.find(x=>x.to===v); if(m) undoMove(m.id); S.planPins[v]='rest'; save(); closeModal(); render(); break; }
    case 'pin': { const d=t.dataset.d;
      const m=S.moves.find(x=>x.from===d || x.to===d); if(m) undoMove(m.id); // a manual plan replaces a move on that day
      if(v) S.planPins[d]=v; else delete S.planPins[d]; save(); openModal(daySheet(d)); dayOpen=d; render(); break; }
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
      const e=viewEx(), si=+t.dataset.s, s=e.sets[si], k = a==='stepW'?'w':'r';
      const old = num(s[k]); const nv = Math.max(0, Math.round((old + (+v)*(k==='w'?(S.settings.step||0.25):1))*100)/100);
      s[k] = k==='w'? nv : String(nv);
      // carry the change to the following sets of the same kind (warm-up / working) that had the same value and aren't done yet
      e.sets.slice(si+1).forEach(x=>{ if(!x.end && x.warm===s.warm && num(x[k])===old) x[k]=s[k]; });
      if(k==='w') syncWarm(e, si);
      woFocus=si; save(); render(); break; }
    case 'setFocus': { if(ev.target.closest('input,.edit')) break; const si=+t.dataset.s; woFocus = woFocus===si? -1 : si; render(); break; }
    case 'setStart': startSet(+t.dataset.s); save(); render(); break;
    case 'progApply': { const e=viewEx(), ph=progressHint(e); if(!ph) break; e.sets.forEach(x=>{ if(!x.warm && !x.end) x.w=ph.to; });
      const fi=e.sets.findIndex(x=>!x.warm); if(fi>=0) syncWarm(e, fi); save(); render(); toast(`Working sets now ${fw(ph.to)} kg`); break; }
    case 'setAdd': { const e=viewEx(), w=e.sets.filter(x=>!x.warm), l=w[w.length-1]||e.sets[e.sets.length-1]||{w:'',r:''};
      e.sets.push(newSet(l.w, l.r, false));
      // adding a set to the exercise you just finished brings you back to it
      if(e===curEx() && W.moving && !e.skipped){ W.moving=null; e.left=null; }
      woFocus=e.sets.length-1; save(); render(); break; }
    case 'setCheck': checkSet(+t.dataset.s); save(); render(); break;
    case 'warmupDone': warmupDone(Date.now()); break;
    case 'arrive': arrive(); break;
    case 'exMoveOn': leaveExercise(Date.now(), false); save(); render(); break;
    case 'exPrev': exSwitch('up'); break;
    case 'exNext': exSwitch('down'); break;
    case 'exToCur': W.view=Math.max(0,W.idx); woAnim='down'; woScroll='top'; woFocus=null; save(false); render(); break;
    case 'exGear': openModal(exGearSheet()); break;
    case 'wuGear': openModal(wuGearSheet()); break;
    case 'wuSave': { const text=$('#wuText').value.trim(), minutes=Math.max(0,parseInt($('#wuMin').value)||0);
      Object.assign(W.warmup, {text, minutes});
      if(v==='tpl'){ tplChange(W.key, 'Changed warm-up', tp=>{ tp.warmup={text, minutes}; }); toast(tplPendingNote()); } else toast('Changed for this workout only');
      save(); closeModal(); render(); break; }
    case 'gearSave': gearSave(v==='tpl'); save(); closeModal(); render(); break;
    case 'gearRemove': { const e=viewEx(); if(confirm(`Remove “${e.tplName}” from the ${keyLabel(W.key)} template? This saves a new version; the old one stays in Settings. It stays in today's workout.`)){
      tplChange(W.key, `Removed “${e.tplName}”`, tp=>{ tp.exercises=tp.exercises.filter(x=>x.name!==e.tplName); }); save(); closeModal(); render(); toast(tplPendingNote()); } break; }
    case 'exMoveOpen': openModal(exMoveSheet()); break;
    case 'exUp': case 'exDown': { const i=+t.dataset.i, j=a==='exUp'? i-1 : i+1, L=W.exercises;
      if(j>W.idx && j<L.length && !L[j].arrived){ [L[i],L[j]]=[L[j],L[i]]; save(); openModal(exMoveSheet()); render(); } break; }
    case 'exDoNext': exDoNext(+t.dataset.i); save(); closeModal(); woScroll='top'; render(); break;
    case 'exAddOpen': openModal(exAddSheet()); break;
    case 'exAdd': { const g=id=>$('#'+id).value.trim(); const name=g('aName'); if(!name){ toast('Enter a name'); break; }
      const tpl={name, info:g('aInfo'), kind:g('aKind'), muscle:g('aMuscle'), sets:Math.max(1,parseInt(g('aSets'))||3), target:g('aR')||'10', rest:Math.max(0,parseInt(g('aRest'))||0), warm:g('aKind')==='w'? 1 : 0, w:num(g('aW'))};
      exAddOne(tpl, v==='tpl'); save(); closeModal(); render(); toast(v==='tpl'? 'Added. '+tplPendingNote() : 'Added after the current exercise'); break; }
    case 'exSkipOpen': openModal(exSkipSheet()); break;
    case 'exSkip': leaveExercise(Date.now(), true); save(); closeModal(); render(); break;
    case 'wipSnap': W.lastSnap=Date.now(); save(false); saveToICloud(); render(); break;
    case 'agoOpen': openModal(agoSheet(v)); break;
    case 'endEarlyOpen': openModal(agoSheet('end')); break;
    case 'agoPick': { const ts = Date.now() - (+v)*60000, k=t.dataset.k;
      if(k==='end') endEarly(ts);
      else if(k==='stretch'){ W.stretch.end=Math.max(W.stretch.start+1000, Math.min(Date.now(),ts)); W.stage='context'; save(); closeModal(); render(); }
      else warmupDone(ts); break; }
    case 'back': goBack(); break;
    case 'checkinDone': checkinDone(); break;
    case 'checkinCancel': if(confirm('Cancel this workout? Nothing is saved.')){ S.settings.nextOverride=W.prevOverride||null; S.active=null; save(); go('today'); } break;
    case 'stretchYes': W.stretch={did:true, start:Date.now(), end:null}; W.stage='stretching'; save(); render(); break;
    case 'stretchNo': W.stretch={did:false}; W.stage='context'; save(); render(); break;
    case 'stretchDone': W.stretch.end=Date.now(); W.stage='context'; save(); render(); break;
    case 'ctx': W.context=v; W.stage='final'; save(); window.scrollTo(0,0); render(); break;
    case 'saveWorkout': saveWorkout(); break;
    case 'discard': if(confirm('Discard this workout? No sets will be saved.'+(W.tplDraft?' Your template changes are kept as a new version.':''))){ tplCommit(); S.active=null; save(); go('today'); } break;
    // health
    case 'healthActive': requestHealth('active', W.start, W.end||Date.now()); break;
    case 'healthSes': { const s=S.sessions.find(x=>x.id===t.dataset.id); if(s){ const d=dayOpen; requestHealth(s.id, s.start, s.end); if(d) openModal(daySheet(d)); } break; }
    case 'healthPaste': if(t.dataset.id){ S.healthPending={target:t.dataset.id, at:Date.now()}; save(false); } pasteHealth(); break;
    case 'healthManual': try{ applyHealth($('#hlTxt').value); }catch(e){ toast('Could not read it: '+e.message); } break;
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
    case 'splitCustom': rotCustom=true; render(); break;
    case 'splitPreset': rotCustom=false; S.settings.rotation = v.split(','); S.settings.nextOverride=null; save(); render(); toast('Split: '+S.settings.rotation.join(' → ')); break;
    case 'rotUp': { const i=+t.dataset.i, r=S.settings.rotation; if(i>0){ [r[i-1],r[i]]=[r[i],r[i-1]]; save(); render(); } break; }
    case 'rotDel': if(S.settings.rotation.length>1){ S.settings.rotation.splice(+t.dataset.i,1); save(); render(); } break;
    case 'rotAdd': S.settings.rotation.push(TYPES.find(x=>!S.settings.rotation.includes(x))||'Push'); save(); render(); break;
    case 'clearPins': if(confirm('Remove all upcoming fixed days? They go back to automatic.')){ Object.keys(S.planPins).forEach(d=>{ if(d>=iso()) delete S.planPins[d]; }); save(); render(); } break;
    case 'sound': S.settings.sound = v==='1'; save(); render(); break;
    case 'keepAwake': S.settings.keepAwake = v==='1'; save(); render(); break;
    case 'theme': S.settings.theme=v; save(); render(); break;
    case 'tplTab': if(tplEd && tplEd.changed && !confirm('Discard your unsaved template changes?')) break; tplEd=null; tplEdit=v; render(); break;
    case 'teStart': tplEdStart(); render(); break;
    case 'teCancel': if(tplEd && tplEd.changed && !confirm('Discard your changes?')) break; tplEd=null; render(); break;
    case 'teSave': tplEdSave(); break;
    case 'teAdd': tplEd.t.exercises.push({name:'New exercise', kind:'w', sets:3, target:'8-12', rest:S.settings.defaultRest, muscle:'Other', info:'', warm:1}); tplEd.changed=true; render(); break;
    case 'teDel': { const i=+t.dataset.i, e=tplEd.t.exercises[i]; if(confirm(`Remove “${e.name}” from this workout?`)){ tplEd.t.exercises.splice(i,1); tplEd.changed=true; render(); } break; }
    case 'teMove': { const i=+t.dataset.i, j=i+(+v), L=tplEd.t.exercises; if(j>=0 && j<L.length){ [L[i],L[j]]=[L[j],L[i]]; tplEd.changed=true; render(); } break; }
    case 'tplUse': { const h=(S.tplHistory[tplEdit]||[]).find(x=>x.v===+v); if(h && confirm(`Use ${keyLabel(tplEdit)} v${h.v} again? This saves it as a new version; the current one stays in the list.`)){
      tplChange(tplEdit, `Back to v${h.v}`, tp=>{ const c=JSON.parse(JSON.stringify(h.tpl)); tp.warmup=c.warmup; tp.exercises=c.exercises; }); save(); render(); toast(`${keyLabel(tplEdit)} v${S.templates[tplEdit].v} is in use now`); } break; }
    case 'tplPaste': tplPaste(); break;
    case 'defRest': S.settings.defaultRest=+v; save(); render(); break;
    case 'wipSave': S.settings.wipSave=+v; save(); render(); break;
    case 'export': exportData(); break;
    case 'icloudSave': closeModal(); saveToICloud(); break;
    case 'copyAll': copyAllData(); break;
    case 'manual': openManual(v); break;
    case 'pasteAll': restoreFromClipboard(); break;
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
  if(t.matches && t.matches('textarea.auto')) autoGrow(t);
  if(t.dataset.te!=null && tplEd){ tplEdInput(t); return; }
  if(t.id==='manQ'){ manualQuery=t.value; const tmp=document.createElement('div'); tmp.innerHTML=manualSheet(); $('#manTree').innerHTML=tmp.querySelector('#manTree').innerHTML; return; }
  if(t.dataset.in && W){ const e=viewEx(), si=+t.dataset.s, k=t.dataset.in, old=e.sets[si][k];
    e.sets[si][k]=t.value;
    e.sets.slice(si+1).forEach((x,j)=>{ if(!x.end && x.warm===e.sets[si].warm && String(x[k])===String(old)){ x[k]=t.value; const inp=document.querySelector(`[data-in="${k}"][data-s="${si+1+j}"]`); if(inp) inp.value=t.value; } });
    if(k==='w' && syncWarm(e, si)) e.sets.forEach((x,j)=>{ if(x.warm){ const el=document.querySelector(`.set[data-s="${j}"] .val`); if(el) el.innerHTML=setVal(e,x); } });
    save(); }
  else if(t.dataset.pre && W){ W.pre=W.pre||{}; W.pre[t.dataset.pre]=t.value; save(); }
  else if(t.dataset.post && W){ W.post=W.post||{}; W.post[t.dataset.post]=t.value; save(); }
  else if(t.hasAttribute('data-notes') && W){ W.notes=t.value; save(); }
  else if(t.dataset.prof){ S.profile[t.dataset.prof]=t.value; save(); }
  else if(t.dataset.set){ const k=t.dataset.set; S.settings[k] = k==='step'? (num(t.value)||0.25) : k==='progStep'? (num(t.value)||1) : t.value; save(false); }
});
document.addEventListener('change', ev=>{
  const t=ev.target;
  if(t.dataset.te!=null && tplEd){ tplEdInput(t); if(t.tagName==='SELECT') render(); return; }
  if(t.id==='exSel'){ statsEx=t.value; render(); }
  if(t.dataset.rot!=null){ S.settings.rotation[+t.dataset.rot]=t.value; S.settings.nextOverride=null; save(); render(); }
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
document.addEventListener('visibilitychange',()=>{ if(!document.hidden){ S = load(); if(!$('#modal').innerHTML) render(); else if(dayOpen){ const d=dayOpen, sc=$('#modal .sheet').scrollTop; openModal(daySheet(d)); dayOpen=d; $('#modal .sheet').scrollTop=sc; } else tick(); } wakeSync(); });
document.addEventListener('touchcancel',()=>{ if(sh){ sh.d=0; sheetEnd(); } woPull=null; if(ptr){ ptr=null; ptrShow(0); } });

render();
window.__gymBooted = true; // tells the loader this version started fine
if(window.GymLoader && GymLoader.justUpdated) setTimeout(()=>toast('Updated to the latest version ✓'), 300);

// Gym info widget for Scriptable (iPhone). Shows the current exercise, set and a live timer.
// Fill in your worker address and key below (same key as in Cloudflare).
const SERVER = 'https://gym-widget.YOUR-NAME.workers.dev';
const KEY = 'YOUR-KEY';

const C = { bg:new Color('#1b1d22'), ink:Color.white(), dim:new Color('#9aa0aa'), run:new Color('#4c8dff'), rest:new Color('#f0a63a'), ok:new Color('#3ec27a'), bad:new Color('#ff5a5a') };

let v;
try { v = await new Request(`${SERVER}/widget?k=${encodeURIComponent(KEY)}&t=${Date.now()}`).loadJSON(); }
catch(e){ v = {phase:'error', msg:String(e.message||e)}; }

const w = new ListWidget();
w.backgroundColor = C.bg;
w.setPadding(10, 12, 10, 12);
const line = (t, size, color, bold) => { const x=w.addText(String(t)); x.font = bold? Font.boldSystemFont(size) : Font.systemFont(size); x.textColor=color; x.lineLimit=1; x.minimumScaleFactor=0.5; return x; };
const timer = (ts, size, color) => { const d=w.addDate(new Date(ts)); d.applyTimerStyle(); d.font=Font.boldMonospacedSystemFont(size); d.textColor=color; d.lineLimit=1; d.minimumScaleFactor=0.5; return d; };

// 1st line = what is going on (big and coloured), then the timer, then exercise + set
if(v.phase==='error'){ line('NO CONNECTION', 14, C.bad, true); line(v.msg, 10, C.dim); }
else if(v.phase==='none'){ line('NO WORKOUT', 14, C.dim, true); }
else {
  const over = v.phase==='rest' && Date.now() >= v.restEnd;
  const head = v.phase==='run'? [`SET ${v.set} RUNNING`, C.run] : v.phase==='rest'? [over? 'REST OVER · GO' : 'REST', over? C.ok : C.rest]
    : v.phase==='todo'? ['READY', C.ok] : ['NEXT EXERCISE', C.ok];
  line(head[0], 14, head[1], true);
  if(v.phase==='run') timer(v.since, 24, C.run);
  else if(v.phase==='rest') timer(v.restEnd, 24, over? C.ok : C.rest); // counts down to 0, then up again
  else line(v.phase==='todo'? 'Tap ▶ Next' : 'Open the app', 13, C.ink);
  w.addSpacer(4);
  line(v.name, 13, C.ink, true);
  line(v.phase==='done'? `All ${v.count} sets done` : `Set ${v.set}/${v.count} · ${v.w} kg × ${v.r}`, 11, C.dim);
}
w.addSpacer();
const f=new DateFormatter(); f.dateFormat='HH:mm:ss';
line('as of '+f.string(new Date()), 9, C.dim);

// ask iOS to refresh soon (iOS decides when)
w.refreshAfterDate = new Date(Date.now() + 30*1000);

if(config.runsInWidget) Script.setWidget(w); else await w.presentSmall();
Script.complete();

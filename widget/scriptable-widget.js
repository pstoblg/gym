// Gym info widget for Scriptable (iPhone). Shows the current exercise, set and a live timer.
// Fill in your worker address and key below (same key as in Cloudflare).
const SERVER = 'https://gym-widget.YOUR-NAME.workers.dev';
const KEY = 'YOUR-KEY';

const C = { bg:new Color('#1b1d22'), ink:Color.white(), dim:new Color('#9aa0aa'), run:new Color('#4c8dff'), rest:new Color('#f0a63a'), ok:new Color('#3ec27a') };

let v;
try { v = await new Request(`${SERVER}/widget?k=${encodeURIComponent(KEY)}`).loadJSON(); }
catch(e){ v = {phase:'error', msg:String(e.message||e)}; }

const w = new ListWidget();
w.backgroundColor = C.bg;
w.setPadding(12, 14, 12, 14);
const line = (t, size, color, bold) => { const x=w.addText(t); x.font = bold? Font.boldSystemFont(size) : Font.systemFont(size); x.textColor=color; x.lineLimit=1; x.minimumScaleFactor=0.6; return x; };
const timer = (ts, size, color) => { const d=w.addDate(new Date(ts)); d.applyTimerStyle(); d.font=Font.boldMonospacedSystemFont(size); d.textColor=color; return d; };

if(v.phase==='none' || v.phase==='error'){
  line('Gym', 13, C.dim, true); w.addSpacer(6);
  line(v.phase==='error'? 'Cannot reach the server' : 'No workout running', 15, C.ink, true);
  if(v.phase==='error') line(v.msg, 11, C.dim);
} else {
  line(v.name, 15, C.ink, true);
  line(v.phase==='done'? `All ${v.count} sets done` : `Set ${v.set} of ${v.count} · ${v.w} kg × ${v.r}`, 12, C.dim);
  w.addSpacer();
  if(v.phase==='run'){ line('SET RUNNING', 11, C.run, true); timer(v.since, 26, C.run); }
  else if(v.phase==='rest'){
    const over = Date.now() >= v.restEnd;
    line(over? 'REST OVER · GO' : 'REST LEFT', 11, over? C.ok : C.rest, true);
    timer(v.restEnd, 26, over? C.ok : C.rest); // counts down to 0, then counts up again
  }
  else if(v.phase==='todo'){ line('READY', 11, C.ok, true); line('Tap ▶ Next to start', 13, C.ink); }
  else { line('NEXT EXERCISE', 11, C.ok, true); line('Open the app', 13, C.ink); }
}
// ask iOS to refresh soon (it decides when); right after the rest ends the colour switches to green
w.refreshAfterDate = new Date(v.restEnd && v.restEnd > Date.now() ? v.restEnd + 1000 : Date.now() + 60*1000);

if(config.runsInWidget) Script.setWidget(w); else await w.presentSmall();
Script.complete();

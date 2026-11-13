// Gym widget server (Cloudflare Worker). Holds ONLY the workout in progress, so the home-screen
// button (Shortcut) and the info widget (Scriptable) can see and change it while the app is closed.
// Needs: KV binding "GYM" and a secret "KEY". Every request must carry ?k=<KEY>.
//
//   GET  /widget  -> what is going on now (JSON for the Scriptable widget)
//   POST /next    -> do the next step (start set / set done) and return a short text for the banner
//   GET  /reset   -> TEST ONLY: load a fake "Bench Press" workout
//
// Every step is also stored in "ops" with its timestamp, so the app can replay it later.

const json = (o, s=200) => new Response(JSON.stringify(o), {status:s, headers:{'content-type':'application/json'}});
const text = (t, s=200) => new Response(t, {status:s, headers:{'content-type':'text/plain; charset=utf-8'}});

function view(st){
  if(!st || !st.ex) return {phase:'none', msg:'No workout running'};
  const e=st.ex, sets=e.sets, n=sets.length;
  const run=sets.findIndex(x=>x.start && !x.end), todo=sets.findIndex(x=>!x.start);
  const done=sets.filter(x=>x.end), last=done.sort((a,b)=>b.end-a.end)[0];
  const base={name:e.name, count:n, rest:e.rest||0, updated:st.updated};
  if(run>=0) return {...base, phase:'run', set:run+1, w:sets[run].w, r:sets[run].r, since:sets[run].start};
  if(todo<0) return {...base, phase:'done', set:n};
  if(last) return {...base, phase:'rest', set:todo+1, w:sets[todo].w, r:sets[todo].r, since:last.end, restEnd:last.end+(e.rest||0)*1000};
  return {...base, phase:'todo', set:todo+1, w:sets[todo].w, r:sets[todo].r};
}
const setTxt = v => `${v.w} kg \u00d7 ${v.r}`;

function next(st){
  const now=Date.now(), sets=st.ex.sets;
  const run=sets.findIndex(x=>x.start && !x.end), todo=sets.findIndex(x=>!x.start);
  if(run>=0){
    sets[run].end=now; st.ops.push({a:'done', i:run, ts:now});
    const v=view(st);
    return v.phase==='done' ? `\u2713 Set ${run+1} done \u00b7 all sets of ${st.ex.name} done. Open the app for the next exercise.`
      : `\u2713 Set ${run+1} done \u00b7 rest ${st.ex.rest} s \u00b7 next: ${setTxt(v)}`;
  }
  if(todo>=0){
    sets[todo].start=now; st.ops.push({a:'start', i:todo, ts:now});
    return `\u25b6 Set ${todo+1}/${sets.length} started \u00b7 ${setTxt(sets[todo])}`;
  }
  return `All sets of ${st.ex.name} done. Open the app for the next exercise.`;
}

export default {
  async fetch(req, env){
    const url=new URL(req.url);
    if(!env.KEY || url.searchParams.get('k')!==env.KEY) return text('Wrong or missing key', 401);
    const load=async()=>JSON.parse(await env.GYM.get('active') || 'null');
    const store=st=>{ st.updated=Date.now(); return env.GYM.put('active', JSON.stringify(st)); };

    if(url.pathname==='/reset'){
      await store({ex:{name:'Bench Press', rest:90, sets:[1,2,3,4].map(()=>({w:60, r:10, start:null, end:null}))}, ops:[]});
      return text('Test workout ready: Bench Press, 4 \u00d7 60 kg \u00d7 10');
    }
    if(url.pathname==='/widget') return json(view(await load()));
    if(url.pathname==='/next'){
      const st=await load(); if(!st || !st.ex) return text('No workout running');
      const msg=next(st); await store(st); return text(msg);
    }
    return text('Not found', 404);
  }
};

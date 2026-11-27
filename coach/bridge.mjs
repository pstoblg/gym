#!/usr/bin/env node
// Gym Coach bridge: runs on your PC and answers the Coach chats in the Gym app with YOUR Claude Code
// (your subscription login, no API key). No dependencies, Node 22+.
//
//   phone (Gym app) --HTTPS--> your gym-widget Cloudflare worker <--WebSocket-- this bridge --> claude -p
//
// The bridge connects OUT to the worker (no open port, no tunnel). Each chat in the app is one Claude Code
// session (--resume). Your training data arrives with every message and is written to DATA_DIR/training/,
// which is the coach's working folder, so it can read and search all of it. It may only write coach-notes.md.
//
// Config: coach/config.local.json next to this file (never committed):
//   {"url":"https://gym-widget.<name>.workers.dev", "key":"<same KEY as the app>",
//    "dataDir":"C:/Users/<you>/gym-coach", "claude":"C:/Users/<you>/.local/bin/claude.exe"}
// dataDir and claude are optional. Start:  node coach/bridge.mjs

import {spawn, execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CFG_FILE = process.env.GYM_COACH_CONFIG || path.join(HERE, 'config.local.json');
if(!fs.existsSync(CFG_FILE)){
  console.error(`Missing ${CFG_FILE}\nCreate it with {"url":"https://gym-widget.<name>.workers.dev","key":"<KEY>"}`);
  process.exit(1);
}
const cfg = JSON.parse(fs.readFileSync(CFG_FILE, 'utf8'));
const URL_BASE = String(cfg.url||'').trim().replace(/\/+$/,'');
const KEY = String(cfg.key||'').trim();
const DATA_DIR = path.resolve(cfg.dataDir || path.join(os.homedir(), 'gym-coach'));
const TRAIN_DIR = path.join(DATA_DIR, 'training');
const CLAUDE = cfg.claude || findClaude();
const MODELS = ['claude-opus-5-5','claude-sonnet-5-5','claude-haiku-5-5','claude-fable-5-2'];
const EFFORTS = ['low','medium','high','xhigh','max'];
const TOOLS = 'Read,Grep,Glob,Edit,Write,WebSearch,WebFetch';

function findClaude(){
  const local = path.join(os.homedir(), '.local', 'bin', process.platform==='win32'? 'claude.exe' : 'claude');
  if(fs.existsSync(local)) return local;
  try{ return execFileSync(process.platform==='win32'? 'where' : 'which', ['claude'], {encoding:'utf8'}).split(/\r?\n/)[0].trim(); }
  catch(e){ console.error('Claude Code not found. Set "claude" in config.local.json.'); process.exit(1); }
}
if(!URL_BASE || !KEY){ console.error('config.local.json needs "url" and "key"'); process.exit(1); }

fs.mkdirSync(TRAIN_DIR, {recursive:true});
const NOTES = path.join(TRAIN_DIR, 'coach-notes.md');
const CHATS = path.join(TRAIN_DIR, 'chats'); // one transcript per chat, so the coach can look into earlier chats
fs.mkdirSync(CHATS, {recursive:true});
if(!fs.existsSync(NOTES)) fs.writeFileSync(NOTES, '# Coach notes\n\nGoals, injuries, preferences and agreements the coach should remember across chats.\n');

const SYSTEM = `You are the user's personal gym coach, chatting inside their Gym app on their phone.
Your working folder holds their COMPLETE training record, refreshed with every message:
- training-log.md: readable log, newest first (workouts with every set, skips with reasons, other activities, check-in/feeling, Apple Health, bodyweight, work hours, the plan and current templates).
- gym-data.json: the raw app data (sessions, bodyweight, templates, plan, settings, workout in progress) for exact lookups.
- chats/: transcripts of ALL chats with the user (one file per chat, name = date + title). Every chat is a fresh session, so when the user refers to an earlier conversation ("like we said", "the plan from last week"), search there.
- coach-notes.md: YOUR long-term memory. Read it at the start of a chat. When the user tells you a goal, injury, preference or you agree on something, update it (keep it short).
You have full permission to read everything here. Look things up in the data instead of guessing, and quote real numbers (dates, weights, reps).
Weights are kg. For bodyweight exercises (kind "bw") the weight is the TOTAL (bodyweight + added).
Answer like a good coach texting: direct, concrete, short paragraphs or short lists; the screen is a phone. Use the user's language.
You can't change the app's data; if a change is needed, tell the user exactly what to change in the app.`;

const running = new Map(); // job id -> child process
const LIMIT_FILE = path.join(DATA_DIR, 'usage.json'); // last known usage, survives a restart
let ws = null, backoff = 1000, lastLimit = null;
try{ lastLimit = JSON.parse(fs.readFileSync(LIMIT_FILE, 'utf8')); }catch(e){}

function send(o){ if(ws && ws.readyState===1) ws.send(JSON.stringify(o)); }
function hello(){ send({t:'hello', host:os.hostname(), models:MODELS, efforts:EFFORTS, busy:running.size, limit:lastLimit}); }

function connect(){
  const wsUrl = URL_BASE.replace(/^http/, 'ws') + '/coach/pc?k=' + encodeURIComponent(KEY);
  ws = new WebSocket(wsUrl);
  ws.onopen = () => { backoff = 1000; console.log(`[${ts()}] connected to ${URL_BASE}`); hello(); };
  ws.onmessage = ev => { let m; try{ m = JSON.parse(ev.data); }catch(e){ return; }
    if(m.t==='job') runJob(m.job).catch(e=>{ console.error(e); send({t:'ev', id:m.job.id, done:true, error:String(e.message||e)}); });
    if(m.t==='stop'){ const c = running.get(m.id); if(c){ c.stopped = true; killTree(c); } } };
  ws.onclose = ev => { console.log(`[${ts()}] disconnected (${ev.code}), retry in ${backoff/1000}s`); ws = null;
    setTimeout(connect, backoff); backoff = Math.min(backoff*2, 60000); };
  ws.onerror = () => {};
}
setInterval(()=>{ if(ws && ws.readyState===1) ws.send('ping'); }, 25000);
const ts = () => new Date().toLocaleTimeString('de-CH');

function killTree(c){
  if(process.platform==='win32'){ try{ execFileSync('taskkill', ['/pid', String(c.pid), '/T', '/F'], {stdio:'ignore'}); }catch(e){} }
  else c.kill('SIGTERM');
}

function writeData(files){
  // only plain names inside the training folder; coach-notes.md is the coach's own file and never overwritten
  for(const [name, content] of Object.entries(files||{})){
    if(!/^[\w.-]+$/.test(name) || name==='coach-notes.md') continue;
    fs.writeFileSync(path.join(TRAIN_DIR, name), String(content));
  }
}

async function runJob(job){
  if(running.has(job.id)) return;
  writeData(job.files);
  const model = MODELS.includes(job.model)? job.model : MODELS[0];
  const effort = EFFORTS.includes(job.effort)? job.effort : 'high';
  const args = ['-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages',
    '--model', model, '--effort', effort, '--tools', TOOLS, '--permission-mode', 'acceptEdits',
    '--strict-mcp-config', '--append-system-prompt', SYSTEM];
  if(job.session) args.push('--resume', job.session);
  console.log(`[${ts()}] job ${job.id} ${model}/${effort}${job.session? ' resume '+job.session.slice(0,8) : ' new chat'}`);

  const child = spawn(CLAUDE, args, {cwd:TRAIN_DIR, stdio:['pipe','pipe','pipe'], windowsHide:true});
  running.set(job.id, child); hello();
  child.stdin.end(String(job.prompt||''));

  // the text is sent in batches (about 3x per second) so the worker isn't flooded
  let text = '', sentLen = 0, session = job.session||null, tools = [], flush = null, stderr = '', result = null, ctx = 0;
  const push = (final) => {
    const o = {t:'ev', id:job.id, session, tools};
    if(text.length>sentLen){ o.add = text.slice(sentLen); o.from = sentLen; sentLen = text.length; }
    if(final) Object.assign(o, final, {done:true});
    send(o);
  };
  const later = () => { if(!flush) flush = setTimeout(()=>{ flush = null; push(); }, 350); };

  let buf = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', chunk => {
    buf += chunk; let i;
    while((i = buf.indexOf('\n'))>=0){
      const line = buf.slice(0, i).trim(); buf = buf.slice(i+1);
      if(!line) continue; let m; try{ m = JSON.parse(line); }catch(e){ continue; }
      if(m.session_id) session = m.session_id;
      if(m.type==='stream_event' && m.parent_tool_use_id==null){
        const e = m.event;
        if(e.type==='content_block_delta' && e.delta && e.delta.type==='text_delta'){ text += e.delta.text; later(); }
        // a new text block after tool use starts on a new paragraph
        if(e.type==='content_block_start' && e.content_block && e.content_block.type==='text' && text && !text.endsWith('\n\n')){ text += '\n\n'; }
      }
      if(m.type==='assistant' && m.parent_tool_use_id==null){
        for(const b of (m.message && m.message.content)||[]) if(b.type==='tool_use'){ tools.push(toolLabel(b)); later(); }
      }
      // subscription usage: every window (five_hour = session, seven_day = week, ...) with its reset time
      if(m.type==='rate_limit_event' && m.rate_limit_info){ const w = m.rate_limit_info.unifiedWindows||{};
        lastLimit = {at:Date.now(), windows:Object.fromEntries(Object.entries(w).map(([k,v])=>[k, {u:v.utilization, reset:(v.resetsAt||0)*1000, status:v.status}]))};
        try{ fs.writeFileSync(LIMIT_FILE, JSON.stringify(lastLimit)); }catch(e){} }
      // context size of the last model call = what one more message in this chat costs at least
      if(m.type==='stream_event' && m.parent_tool_use_id==null && m.event.type==='message_start'){ const u = m.event.message.usage||{};
        ctx = (u.input_tokens||0) + (u.cache_creation_input_tokens||0) + (u.cache_read_input_tokens||0); }
      if(m.type==='result') result = m;
    }
  });
  child.stderr.setEncoding('utf8'); child.stderr.on('data', d => { stderr += d; });

  await new Promise(res => child.on('close', res));
  running.delete(job.id); clearTimeout(flush);
  if(child.stopped) push({stopped:true});
  else if(result && !result.is_error){ const u = result.usage||{};
    push({cost:result.total_cost_usd||0, ms:result.duration_ms||0, limit:lastLimit,
      usage:{ctx, tin:(u.input_tokens||0)+(u.cache_creation_input_tokens||0)+(u.cache_read_input_tokens||0), out:u.output_tokens||0, cached:u.cache_read_input_tokens||0}}); }
  else push({error: (result && (result.result || (result.errors||[]).join(' '))) || stderr.trim().slice(-400) || 'Claude Code stopped without an answer'});
  saveTranscript(job, text, child.stopped? 'stopped' : result && !result.is_error? '' : 'failed');
  console.log(`[${ts()}] job ${job.id} ${child.stopped? 'stopped' : result && !result.is_error? 'done' : 'failed'}`);
  hello();
}

function saveTranscript(job, answer, note){
  if(!job.chat || !/^[\w-]+$/.test(job.chat)) return;
  const existing = fs.readdirSync(CHATS).find(f=>f.endsWith('_'+job.chat+'.md'));
  const day = new Date().toISOString().slice(0,10);
  const slug = String(job.title||'chat').toLowerCase().replace(/[^a-z0-9äöü]+/g,'-').replace(/^-|-$/g,'').slice(0,40) || 'chat';
  const file = path.join(CHATS, existing || `${day}_${slug}_${job.chat}.md`);
  if(!existing) fs.writeFileSync(file, `# ${job.title||'Chat'}
Started ${day}
`);
  fs.appendFileSync(file, `
## User (${new Date().toLocaleString('de-CH')})
${job.prompt}

## Coach${note? ' ('+note+')' : ''}
${answer||'-'}
`);
}

function toolLabel(b){
  const i = b.input||{}, f = s => path.basename(String(s||''));
  switch(b.name){
    case 'Read': return 'Read ' + f(i.file_path);
    case 'Grep': return 'Searched "' + String(i.pattern||'').slice(0,40) + '"';
    case 'Glob': return 'Listed files';
    case 'Edit': case 'Write': return 'Updated ' + f(i.file_path);
    case 'WebSearch': return 'Web: ' + String(i.query||'').slice(0,50);
    case 'WebFetch': return 'Opened ' + String(i.url||'').replace(/^https?:\/\//,'').slice(0,50);
    default: return b.name;
  }
}

console.log(`Gym Coach bridge\n  Claude Code: ${CLAUDE}\n  Data folder: ${TRAIN_DIR}`);
connect();

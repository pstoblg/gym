# Gym Coach

Chat with your own Claude Code (your subscription, no API key) from the Coach tab of the Gym app.
It sees your whole training record with every message.

```
Gym app (Coach tab) --HTTPS--> gym-widget worker (/coach/*) <--WebSocket-- bridge.mjs on your PC --> claude -p
```

- Each chat in the app is one Claude Code session (`--resume`), so follow-ups keep the context. Model and effort can be changed per message.
- With every message the app sends `training-log.md` (readable) and `gym-data.json` (raw, without the server key).
  The bridge writes them to `<dataDir>/training/`, the coach's working folder. They pass through the worker but are not stored there.
- The coach may read and search that folder and the web, and write only `coach-notes.md` (its long-term memory: goals, injuries, agreements). No shell.
- The PC has to be on with the bridge running. If it is offline, the app says so.

## Setup (once)
1. Deploy the worker (`widget/`, `npx wrangler@4 deploy`). It is the same server and key as the home-screen buttons.
2. Create `coach/config.local.json` (never committed):
   ```json
   {"url": "https://gym-widget.<name>.workers.dev", "key": "<the KEY from the app settings>"}
   ```
   Optional: `"dataDir"` (default `~/gym-coach`), `"claude"` (path to claude.exe, found automatically).
3. Start it: double-click `start-coach.cmd` (restarts itself if it stops), or `node coach/bridge.mjs`.
   Autostart: Win+R → `shell:startup` → put a shortcut to `start-coach.cmd` there.
4. In the app: Coach tab → "PC online" → New chat.

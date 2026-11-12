# Gym – development notes

Static PWA (no build step). GitHub Pages serves only the **loader** `index.html` from branch `live`: https://pstoblg.github.io/gym/

- `index.html`: the loader. On every start it asks the GitHub API for the newest commit on `live`, downloads `app.js` + `app.css` for that exact commit from raw.githubusercontent.com,
  stores them in localStorage (`gym.code`, previous version in `gym.code.prev`), and runs them. Offline it runs the stored version.
  Opened via file:// it loads the local `app.js`/`app.css` instead (append `?remote=1` to test the GitHub path locally). It rarely needs changes.
- `app.js`: the whole app (vanilla JS, builds its own DOM skeleton).
  - Data model and defaults: `defaultState()`. Upgrades: `migrate()`, which bumps `v`.
  - Storage key `gym.v1`. It falls back to the legacy key `ppl-log.v1` (same github.io origin).
  - Views: welcome wizard (`viewOnboarding`), Today, Workout wizard (`viewWorkout`: warm-up → exercises → stretch → context → final), History (calendar + day details), Stats, Settings.
  - Training plan: `planDays(n)` lays `settings.rotation` onto training days (not in `restDays`), starting from `rotationState()` (last done workout). `S.planPins[date]` = days fixed by hand; they stay put, and auto days flow around them. A skip does not consume the workout, so it shifts to the next training day. `unaccountedDays()` flags past training days without an entry. Moves (`doMove`/`undoMove`): from-day → rest, to-day → training (`train` pin = next workout of the rotation), previous pins stored in the move for exact undo; a manual pin on either day replaces the move; `moveCheck`/`longRuns` warn about too many days in a row (`maxInRow()`). `unaccountedDays()` starts at `firstTrackedDay()` (first entry/move).
  - Backup: every `saveToICloud()` sets a new `backupToken`; `compareBackup()` checks a picked data.json against the app (token, all ids, moves, bodyweight, plan).
  - Manual: `MANUAL` tree (sections → topics with where/text), opened from Settings → Manual, searchable.
  - The workout in progress lives in `S.active` and is saved on every change, so a reload resumes exactly where it left off. It stores only timestamps (no running timers).
  - Set flow (`viewWorkout` / `exScreen`): one exercise per screen (`a.view`), `a.idx` = exercise you are at, `a.moving` = left the last one, waiting for "I'm at the machine" (`arrive`). Sets have `start`/`end` (Start / ✓), rest = ✓ → next Start (`liveRestIdx`), `est` marks estimated times. Switching exercises = past the top/bottom edge twice (`edgeGesture`), or ‹. The bottom bar is rendered into `#timer` (`renderTimer`). Saved sessions keep working sets in `sets` and warm-up sets in `warm`; `recordTimeline` draws a finished workout. Weight exercises get one warm-up set by default; its weight is `warmWeight()` (30–50 %, stackable) and follows the first working set (`syncWarm`). While a workout runs the tab bar is hidden and VIEW is forced to the workout.
  - Templates: every change goes through `tplChange()` and becomes a new version `t.v`, all versions with snapshots in `S.tplHistory[key]`. During a workout of that template the changes collect in `a.tplDraft` (+ `a.tplNotes`) and `tplCommit()` turns them into ONE version on save or discard. Settings → ✎ Edit (`tplEd`, `tplEditorHtml`, `tplEdSave`) edits a copy and saves one version; a rename offers to rename the same exercise in the other templates (history is linked by exact name).
  - Workout extras: `progressHint()` (all working sets hit the top of the rep range last time → +`settings.progStep` kg), `perRep()` (s/rep on done sets), "+ Add a set" (`setAdd`, resumes a finished exercise), Screen Wake Lock while a workout runs (`wakeSync`, `settings.keepAwake`). The "Previous" edge is hidden until you pull at the top; other screens have pull-to-refresh (`ptr`).
  - Other activities (golf, swimming): sessions with `activity` (type `'Other'`). `isGym()` / `gymOn()` keep them out of the plan, rotation and to-log logic.
  - Apple Health: `parseHealth()` accepts JSON, `key=value` text or four numbers; if the clipboard is empty (a copied Shortcuts Dictionary arrives empty) a manual paste box opens.
  - Must end by setting `window.__gymBooted = true`. Otherwise the loader shows its error screen with rollback.
- `app.css`: all styles.
- `sw.js`: offline cache for the loader shell only (same-origin). Bump `VERSION` when the shell files change.
- iCloud backup and Apple Health go through Apple Shortcuts (`saveToICloud`, `requestHealth`). A web app can't access HealthKit or iCloud Drive directly.

## Rules
- **No personal data in the repo.** This means no real workout logs, bodyweights, dates of real sessions, names, emails or handoff notes.
  Defaults and seed data stay generic. `.gitignore` blocks `*.json` data files and backups.
- Commit as `pstoblg <155739606+pstoblg@users.noreply.github.com>` (local git config), never with the work identity.
- **Deploying = pushing to `live`.** The phone picks it up on the next app start (or via Settings → Check for updates). The user agreed to direct pushes to `live`.
  Test before every push: the phone runs whatever is on `live`. `main` is not used for deployment. A hook blocks commits on `main`.
- Before committing, run `node --check app.js` (and on the loader's `<script>` block if it changed). For behaviour, run a headless Edge test page (see the git history for the pattern).
- Keep stored data backwards compatible: new fields get defaults in `migrate()`.

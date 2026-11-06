# Gym – development notes

Static PWA (no build step). GitHub Pages serves only the **loader** `index.html` from branch `live`: https://pstoblg.github.io/gym/

- `index.html`: the loader. On every start it asks the GitHub API for the newest commit on `live`, downloads `app.js` + `app.css` for that exact commit from raw.githubusercontent.com,
  stores them in localStorage (`gym.code`, previous version in `gym.code.prev`), and runs them. Offline it runs the stored version.
  Opened via file:// it loads the local `app.js`/`app.css` instead (append `?remote=1` to test the GitHub path locally). It rarely needs changes.
- `app.js`: the whole app (vanilla JS, builds its own DOM skeleton).
  - Data model and defaults: `defaultState()`. Upgrades: `migrate()`, which bumps `v`.
  - Storage key `gym.v1`. It falls back to the legacy key `ppl-log.v1` (same github.io origin).
  - Views: welcome wizard (`viewOnboarding`), Today, Workout wizard (`viewWorkout`: warm-up → exercises → stretch → context → final), History (calendar + day details), Stats, Settings.
  - The workout in progress lives in `S.active` and is saved on every change, so a reload resumes exactly where it left off.
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

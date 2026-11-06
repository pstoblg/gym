# Gym – development notes

Static PWA (no build step), hosted on GitHub Pages from `main` / root: https://pstoblg.github.io/gym/

- `index.html`: the whole app (HTML, CSS and vanilla JS).
  - Data model and defaults: `defaultState()`. Upgrades: `migrate()`, which bumps `v`.
  - Storage key `gym.v1`. It falls back to the legacy key `ppl-log.v1` (same github.io origin).
  - Views: welcome wizard (`viewOnboarding`), Today, Workout wizard (`viewWorkout`: warm-up → exercises → stretch → context → final), History (calendar + day details), Stats, Settings.
  - The workout in progress lives in `S.active` and is saved on every change, so a reload resumes exactly where it left off.
- `sw.js`: offline cache. **Bump `VERSION` on every change to app files.**
- iCloud backup and Apple Health go through Apple Shortcuts (`saveToICloud`, `requestHealth`). A web app can't access HealthKit or iCloud Drive directly.

## Rules
- **No personal data in the repo.** This means no real workout logs, bodyweights, dates of real sessions, names, emails or handoff notes.
  Defaults and seed data stay generic. `.gitignore` blocks `*.json` data files and backups.
- Commit as `pstoblg <155739606+pstoblg@users.noreply.github.com>` (local git config), never with the work identity.
- Work on `feature/NO-ISSUE-…` branches. A hook blocks commits on `main`, and the user merges.
- Before committing, extract the `<script>` block and run `node --check` on it. For behaviour, run a headless Edge test page (see the git history for the pattern).
- Keep stored data backwards compatible: new fields get defaults in `migrate()`.

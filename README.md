# Gym – training tracker (iPhone web app)

A web app you install on the iPhone home screen. It tracks push/pull/legs workouts, weights, skips, stretching and progress.
All data stays on the device (localStorage), and backups go to the user's own iCloud Drive. Nothing is sent to a server.

## How it's served
GitHub Pages (repo → Settings → Pages → branch `live`, `/ (root)`) only serves the small loader `index.html`: https://pstoblg.github.io/gym/
On every start, the loader fetches the newest `app.js` / `app.css` from the `live` branch directly from GitHub and keeps a copy on the phone.
So a push to `live` reaches the phone on the next app start, with no Pages build wait. Offline, the last downloaded version runs.
Settings → App version has *Check for updates* and *Go back to the previous version*.

## Install on iPhone
Open the URL in **Safari** → Share → **Add to Home Screen**. On first launch, a welcome wizard asks for your name (stored only on the device),
sets up the basics, and walks you through the iCloud backup, including a check that it actually works.

## iCloud backup (Shortcut "Gym Save")
The app copies its data to the clipboard and runs the Shortcut. The Shortcut saves `iCloud Drive/Gym/data.json` plus a dated copy in `Gym/backups/`.
The step-by-step setup is shown inside the app (welcome wizard and Settings).
**Backup check:** the app saves a test backup with a random marker. You pick `Gym/data.json` in the Files dialog, and the app confirms the marker matches.
iOS doesn't let web apps open iCloud files without the user picking them, which is why this step needs one tap from you.

## Apple Health (optional, Shortcut "Gym Health")
The app passes the workout's start and end time to the Shortcut. The Shortcut reads steps, active energy and heart rate for that time from Apple Health
and copies the result. Back in the app, tap *Paste Apple Health result*. Setup steps are in Settings.

## Updating
Push to `live`, then restart the app on the phone. Only bump `VERSION` in `sw.js` when the loader shell (index.html, manifest, icons) changes.

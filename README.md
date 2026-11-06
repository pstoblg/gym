# Gym – training tracker (iPhone web app)

A web app you install on the iPhone home screen. It tracks push/pull/legs workouts, weights, skips, stretching and progress.
All data stays on the device (localStorage), and backups go to the user's own iCloud Drive. Nothing is sent to a server.

## Hosting (GitHub Pages)
Repo → **Settings → Pages** → *Deploy from a branch* → `main` / `(root)`.
The app then runs at `https://pstoblg.github.io/gym/`.

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
Change the files, bump `VERSION` in `sw.js`, merge to `main`, and open the app twice on the phone.

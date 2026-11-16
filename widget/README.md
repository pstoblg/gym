# Home-screen buttons for Gym

Your own free Cloudflare Worker (`worker.js`) holds only the workout in progress. It lets a Shortcut on the
home screen do the app's one-button steps, and it sends all workout notifications (the answer to each press, the rest
notifications 10 s before the end and at the end, "you can lock the phone" once per workout) as Web Push to the Gym app. Nothing else leaves the phone.

## Server
1. `npx wrangler@4 login` (once), then in this folder `npx wrangler@4 deploy`.
2. Secrets (`npx wrangler@4 secret put NAME`):
   - `KEY`: any long random text. Every request needs `?k=KEY`.
   - `VAPID_PRIVATE` (P-256 private key as JWK JSON) and `VAPID_PUBLIC` (raw public key, base64url) for the notifications.

## App
Settings → 📱 Home-screen buttons: server address (`https://gym-widget.<name>.workers.dev`) and key,
then "Turn on notifications" (only works in the app opened from the home screen, iOS 16.4+).

## Shortcut
- **Gym Next**: Get Contents of URL `…/next?k=KEY`, Method POST. Nothing else: the answer comes as a notification
  from the Gym app (title "Gym – <exercise>", then what happened, last line "Next = …").
  Remove a **Show Notification** action if your Shortcut still has one, otherwise every message comes twice
  (the second one from Shortcuts).

Add it as a Shortcuts widget to the home screen (or as a control in Control Center / on the lock screen).

Optional, not needed for the workout: **Gym Status** = Get Contents of URL `…/status?k=KEY` (GET) → Show Notification.

`scriptable-widget.js` is an optional info widget for the Scriptable app (iOS refreshes it only now and then).

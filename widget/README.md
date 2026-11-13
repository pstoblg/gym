# Home-screen buttons for Gym

Your own free Cloudflare Worker (`worker.js`) holds only the workout in progress. It lets two Shortcuts on the
home screen do the app's one-button steps, and it sends the rest notifications (10 s before the end and at the end)
as Web Push to the Gym app. Nothing else leaves the phone.

## Server
1. `npx wrangler@4 login` (once), then in this folder `npx wrangler@4 deploy`.
2. Secrets (`npx wrangler@4 secret put NAME`):
   - `KEY`: any long random text. Every request needs `?k=KEY`.
   - `VAPID_PRIVATE` (P-256 private key as JWK JSON) and `VAPID_PUBLIC` (raw public key, base64url) for the notifications.

## App
Settings → 📱 Home-screen buttons: server address (`https://gym-widget.<name>.workers.dev`) and key,
then "Turn on notifications" (only works in the app opened from the home screen, iOS 16.4+).

## Shortcuts
- **Gym Next**: Get Contents of URL `…/next?k=KEY`, Method POST → Show Notification (Contents of URL).
- **Gym Status**: Get Contents of URL `…/status?k=KEY` (GET) → Show Notification (Contents of URL).

Add both as Shortcuts widgets to the home screen (or as controls in Control Center / on the lock screen).

`scriptable-widget.js` is an optional info widget for the Scriptable app (iOS refreshes it only now and then).

# Calisthenics Academy Coach — iPhone app

The full Calisthenics Academy Coach (skill tree, guided timer, training log, badges) as an app you install
from Safari. It works offline and saves your progress on the phone. No App Store, no account.

**Open:** https://im4creative.github.io/calisthenics-academy-assistant/

## Install on iPhone
1. Open the link above in **Safari**.
2. Tap **Share** → **Add to Home Screen** → **Add**.
3. Launch **CA Coach** from your home screen. It opens full screen, like any app.

## Bring your progress over from the Claude version
1. In the Claude artifact: **Settings → Backup → Export my data**.
2. In the iPhone app: **Settings → Backup → Import backup** and pick the file.

Export a backup now and then; it's also how you move to a new phone.

## What's different from the Claude version
Groups and shared athlete cards need the Claude version's shared database, so the iPhone app
hides the Groups tab. Everything else is the same.

## Updating
`src/coach.html` is the same file the Claude artifact runs. After changing it:
```
python3 build.py
git add -A && git commit -m "Update app" && git push
```
Installed phones pick up the new version the next time the app opens with a connection.

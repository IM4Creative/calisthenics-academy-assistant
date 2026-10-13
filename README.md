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

## Accounts (Google or email + password)
Signing in syncs your progress across devices and turns on Groups (create a crew, invite links, events,
each other's stats) and shared athlete cards. Without an account the app still works and saves progress
on the phone; the Groups tab shows a Sign in button.

### One-time Firebase setup (free, about 5 minutes)
1. Go to https://console.firebase.google.com → **Create a project** (Analytics not needed).
2. **Build → Authentication → Get started → Sign-in method:**
   - **Email/Password → Enable → Save.**
   - **Add new provider → Google → Enable**, pick your support email → **Save.**
3. **Authentication → Settings → Authorized domains → Add domain:** `im4creative.github.io`
4. **Build → Firestore Database → Create database** → pick a location near you → **Start in production mode**.
5. **Firestore → Rules:** replace everything with the contents of `firestore.rules` in this repo → **Publish**.
6. **Project settings (gear) → Your apps → Web (</>)** → register an app named "CA Coach" (no hosting) →
   copy the `firebaseConfig` values into `firebase-config.js` in this repo, like:
   ```js
   window.CAC_FIREBASE_CONFIG = { apiKey: "…", authDomain: "…", projectId: "…", storageBucket: "…", messagingSenderId: "…", appId: "…" };
   ```
   Commit that file (edit it right on GitHub). These values are meant to be public; the rules protect the data.

The first time you sign in on a phone, anything you already saved on that phone moves into your account.
Forgot your password? Tap **Forgot password?** on the sign-in screen for a reset email.

## Updating
`src/coach.html` is the same file the Claude artifact runs. After changing it:
```
python3 build.py
git add -A && git commit -m "Update app" && git push
```
Installed phones pick up the new version the next time the app opens with a connection.

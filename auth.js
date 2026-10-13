/* Calisthenics Academy Coach: accounts for the iPhone app.
   Email + password sign-in through Firebase Auth; data in Cloud Firestore, cached on the phone so the app works offline.
   It hands the app a database with the same shape as Claude's artifact db, so the app code doesn't change. */
(function(){
  const cfg = window.CAC_FIREBASE_CONFIG;
  if (!cfg || !cfg.apiKey) return;                       // no config yet: app runs in on-phone mode
  const V = "10.14.1", B = "https://www.gstatic.com/firebasejs/" + V + "/";
  const SKIP = "cac-auth-skip";
  let M = null, FB = null, CUR = null;

  async function load(){
    if (M) return M;
    const [app, auth, fs] = window.__CAC_FB_TEST ? window.__CAC_FB_TEST :
      await Promise.all([import(B + "firebase-app.js"), import(B + "firebase-auth.js"), import(B + "firebase-firestore.js")]);
    const a = app.initializeApp(cfg);
    let au; try { au = auth.initializeAuth(a, { persistence: [auth.indexedDBLocalPersistence, auth.browserLocalPersistence] }); } catch (_) { au = auth.getAuth(a); }
    let db; try { db = fs.initializeFirestore(a, { ignoreUndefinedProperties: true, localCache: fs.persistentLocalCache() }); } catch (_) { db = fs.getFirestore(a); }
    FB = { a, au, db }; M = { app, auth, fs }; return M;
  }
  const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);

  /* ---------- db adapter: Claude-artifact-style API on top of Firestore ---------- */
  function adapter(){
    const fs = M.fs, d = FB.db;
    const plain = v => v && typeof v === "object" && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
    const flat = (o, pre, out) => { for (const k in o) { const v = o[k], p = pre ? pre + "." + k : k; if (plain(v) && Object.keys(v).length) flat(v, p, out); else out[p] = v; } return out; };
    const sDoc = s => ({ id: s.id, exists: s.exists(), data: () => s.data() });
    const sCol = q => ({ docs: q.docs.map(x => ({ id: x.id, data: () => x.data() })) });
    const docRef = path => { const r = fs.doc(d, path); return {
      id: r.id, path,
      collection: n => colRef(path + "/" + n),
      get: async () => sDoc(await fs.getDoc(r)),
      set: data => fs.setDoc(r, data),
      update: data => fs.updateDoc(r, flat(data, "", {})),
      delete: () => fs.deleteDoc(r),
      onSnapshot: (cb, err) => fs.onSnapshot(r, s => cb(sDoc(s)), e => err && err(e))
    }; };
    const colRef = (path, cons) => { cons = cons || []; const q = () => cons.length ? fs.query(fs.collection(d, path), ...cons) : fs.collection(d, path); return {
      doc: id => docRef(path + "/" + (id || fs.doc(fs.collection(d, path)).id)),
      add: async data => { const r = await fs.addDoc(fs.collection(d, path), data); return { id: r.id }; },
      orderBy: (f, dir) => colRef(path, [...cons, fs.orderBy(f, dir || "asc")]),
      limit: n => colRef(path, [...cons, fs.limit(n)]),
      get: async () => sCol(await fs.getDocs(q())),
      onSnapshot: (cb, err) => fs.onSnapshot(q(), s => cb(sCol(s)), e => err && err(e))
    }; };
    return { doc: docRef, collection: colRef };
  }
  function userObj(u){
    const fs = M.fs, d = FB.db;
    return { id: async () => u.uid, isOwner: async () => false, can: async () => true, email: u.email,
      profiles: async ids => { const out = {}; await Promise.all(ids.map(async id => { try { const s = await fs.getDoc(fs.doc(d, "people/" + id)); if (s.exists()) out[id] = { name: s.data().name || "" }; } catch (_) {} })); return out; } };
  }
  /* first sign-in on this phone: copy what was saved on the phone into the account (never overwrites) */
  async function migrate(u, note){
    const flag = "cac-migrated-" + u.uid; try { if (localStorage.getItem(flag)) return; } catch (_) {}
    let store = {}; try { store = JSON.parse(localStorage.getItem("cac-local-db") || "{}") || {}; } catch (_) {}
    const pre = "data/users/local/", keys = Object.keys(store).filter(k => k.startsWith(pre));
    if (keys.length) {
      note("Moving this iPhone's progress into your account…");
      const fs = M.fs, d = FB.db;
      for (const k of keys) { const to = "data/users/" + u.uid + "/" + k.slice(pre.length);
        try { const ex = await fs.getDoc(fs.doc(d, to)); if (!ex.exists()) await fs.setDoc(fs.doc(d, to), store[k]); } catch (_) {} }
    }
    try { localStorage.setItem(flag, "1"); } catch (_) {}
  }
  async function finish(u, note){
    CUR = u;
    try { await withTimeout(M.fs.setDoc(M.fs.doc(FB.db, "people/" + u.uid), { name: u.displayName || (u.email || "").split("@")[0], email: u.email || "" }, { merge: true }), 8000); }
    catch (e) { /* tell the owner plainly when the Firebase setup is incomplete */
      const w = e && e.code === "permission-denied" ? "Signed in, but the database rules block saving. Paste firestore.rules into Firestore → Rules and Publish."
        : e && (e.code === "not-found" || e.code === "failed-precondition") ? "Signed in, but there's no Firestore database yet. Create one in the Firebase console."
        : null;
      if (w) setTimeout(() => { try { toast(w); } catch (_) { alert(w); } }, 2500); }
    await migrate(u, note);
    if (u.displayName) { try { const pr = M.fs.doc(FB.db, "data/users/" + u.uid + "/profile"), ps = await M.fs.getDoc(pr); if (!ps.exists() || !(ps.data() || {}).nick) await M.fs.setDoc(pr, { nick: u.displayName.split(" ")[0] }, { merge: true }); } catch (_) {} }
    return { db: adapter(), user: userObj(u), uid: u.uid };
  }

  /* ---------- sign-in screen ---------- */
  const ERR = { "auth/invalid-email": "That email address doesn't look right.", "auth/missing-password": "Enter your password.",
    "auth/invalid-credential": "Email or password is incorrect.", "auth/wrong-password": "Email or password is incorrect.", "auth/user-not-found": "No account with that email. Tap Create account.",
    "auth/email-already-in-use": "That email already has an account. Sign in instead.", "auth/weak-password": "Use at least 6 characters for your password.",
    "auth/too-many-requests": "Too many tries. Wait a minute and try again.", "auth/network-request-failed": "No connection. Connect to the internet to sign in.",
    "auth/operation-not-allowed": "This sign-in method isn't turned on yet in Firebase.", "auth/unauthorized-domain": "This web address isn't on Firebase's authorized domains list.",
    "auth/account-exists-with-different-credential": "That email already signs in another way. Use email and password." };
  function screen(){
    return new Promise(resolve => {
      const el = document.createElement("div"); el.id = "authScreen"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "Sign in");
      let mode = "in";
      const css = `#authScreen{position:fixed;inset:0;z-index:200;background:var(--bg,#F2F4F5);color:var(--ink,#0F1113);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:max(24px,env(safe-area-inset-top)) 22px max(24px,env(safe-area-inset-bottom));overflow-y:auto;font-family:var(--font,system-ui)}
      #authScreen .au{width:100%;max-width:380px;display:grid;gap:12px}
      #authScreen .au-logo{width:96px;height:96px;justify-self:center;margin-bottom:4px}
      #authScreen h2{margin:0;text-align:center;font-size:1.6rem;font-weight:800}
      #authScreen .au-sub{text-align:center;color:var(--muted,#5B636A);font-weight:600;font-size:.92rem;margin:-6px 0 6px}
      #authScreen label{display:grid;gap:5px;font-weight:700;font-size:.78rem;letter-spacing:.06em;text-transform:uppercase;color:var(--muted,#5B636A)}
      #authScreen input{font:inherit;font-size:16px;font-weight:600;text-transform:none;letter-spacing:0;color:var(--ink,#0F1113);min-height:50px;padding:0 14px;border-radius:12px;border:1px solid var(--rule,#E5E9EC);background:var(--panel,#fff)}
      #authScreen input:focus{outline:2px solid var(--teal,#0E97AE);outline-offset:1px}
      #authScreen .au-go{min-height:52px;border:0;border-radius:14px;background:var(--g-teal,#0E97AE);color:#0F1113;font:inherit;font-weight:800;font-size:1rem;margin-top:4px}
      #authScreen .au-go[disabled]{opacity:.6}
      #authScreen .au-link{border:0;background:none;color:var(--teal,#0E97AE);font:inherit;font-weight:700;font-size:.9rem;padding:6px}
      #authScreen .au-row{display:flex;justify-content:space-between;gap:8px}
      #authScreen .au-msg{min-height:1.3em;text-align:center;font-weight:700;font-size:.86rem}
      #authScreen .au-msg.err{color:var(--red,#F0563E)}
      #authScreen .au-skip{margin-top:14px;border:0;background:none;color:var(--muted,#5B636A);font:inherit;font-weight:700;font-size:.85rem;text-decoration:underline;text-underline-offset:3px}
      #authScreen .au-google{display:flex;align-items:center;justify-content:center;gap:10px;min-height:52px;border-radius:14px;border:1px solid var(--rule,#E5E9EC);background:var(--panel,#fff);color:var(--ink,#0F1113);font:inherit;font-weight:800;font-size:1rem}
      #authScreen .au-google svg{width:22px;height:22px}
      #authScreen .au-or{display:flex;align-items:center;gap:10px;color:var(--muted,#5B636A);font-weight:700;font-size:.78rem;margin:2px 0}
      #authScreen .au-or::before,#authScreen .au-or::after{content:"";flex:1;height:1px;background:var(--rule,#E5E9EC)}
      #authScreen [hidden]{display:none!important}`;
      el.innerHTML = `<style>${css}</style><form class="au" novalidate>
        <div class="au-logo">${typeof logoSVG === "function" ? logoSVG("", { mark: true }) : ""}</div>
        <h2 id="auH">Welcome back</h2><div class="au-sub" id="auSub">Sign in to sync your training and join groups.</div>
        <button type="button" class="au-google" id="auGoogle"><svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>Continue with Google</button>
        <div class="au-or"><span>or use email</span></div>
        <label id="auNameL" hidden>Name<input id="auName" autocomplete="name" placeholder="What your crew calls you"></label>
        <label>Email<input id="auEmail" type="email" autocomplete="email" inputmode="email" autocapitalize="off" spellcheck="false" placeholder="you@example.com" required></label>
        <label>Password<input id="auPass" type="password" autocomplete="current-password" placeholder="At least 6 characters" required></label>
        <div class="au-msg" id="auMsg" aria-live="polite"></div>
        <button class="au-go" id="auGo" type="submit">Sign in</button>
        <div class="au-row"><button type="button" class="au-link" id="auMode">Create account</button><button type="button" class="au-link" id="auForgot">Forgot password?</button></div>
        <button type="button" class="au-skip" id="auSkip">Use without an account</button>
      </form>`;
      document.body.appendChild(el);
      const $ = s => el.querySelector(s), msg = (t, err) => { const m = $("#auMsg"); m.textContent = t || ""; m.classList.toggle("err", !!err); };
      const setMode = m => { mode = m; const up = m === "up";
        $("#auH").textContent = up ? "Create your account" : "Welcome back";
        $("#auSub").textContent = up ? "Your email keeps your progress safe and synced." : "Sign in to sync your training and join groups.";
        $("#auNameL").hidden = !up; $("#auGo").textContent = up ? "Create account" : "Sign in";
        $("#auMode").textContent = up ? "I have an account" : "Create account"; $("#auForgot").hidden = up;
        $("#auPass").autocomplete = up ? "new-password" : "current-password"; msg(""); };
      $("#auMode").onclick = () => setMode(mode === "up" ? "in" : "up");
      $("#auGoogle").onclick = async () => {
        const g = $("#auGoogle"); g.disabled = true; msg("Opening Google…");
        const prov = new M.auth.GoogleAuthProvider(); prov.setCustomParameters({ prompt: "select_account" });
        try {
          const cred = await M.auth.signInWithPopup(FB.au, prov);
          try { localStorage.removeItem(SKIP); } catch (_) {}
          const res = await finish(cred.user, t => msg(t)); el.remove(); resolve(res);
        } catch (e) {
          if (["auth/popup-blocked", "auth/operation-not-supported-in-this-environment", "auth/web-storage-unsupported"].includes(e.code)) {
            msg("Continuing to Google…"); try { localStorage.removeItem(SKIP); sessionStorage.setItem("cac-g-redirect", "1"); } catch (_) {}
            try { await M.auth.signInWithRedirect(FB.au, prov); return; } catch (e2) { e = e2; }
          }
          g.disabled = false;
          msg(e.code === "auth/popup-closed-by-user" || e.code === "auth/cancelled-popup-request" ? "" : (ERR[e.code] || ("Google sign-in didn't finish (" + (e.code || e.message || "unknown") + "). Try again or use email.")), true);
        }
      };
      $("#auSkip").onclick = () => { try { localStorage.setItem(SKIP, "1"); } catch (_) {} el.remove(); resolve(null); };
      $("#auForgot").onclick = async () => { const em = $("#auEmail").value.trim(); if (!em) return msg("Enter your email first, then tap Forgot password.", true);
        try { await M.auth.sendPasswordResetEmail(FB.au, em); msg("Reset link sent. Check your email, then sign in here."); } catch (e) { msg(ERR[e.code] || "Couldn't send the reset email.", true); } };
      el.querySelector("form").onsubmit = async ev => { ev.preventDefault();
        const em = $("#auEmail").value.trim(), pw = $("#auPass").value, nm = $("#auName").value.trim();
        if (!em) return msg("Enter your email.", true); if (!pw) return msg("Enter your password.", true);
        const go = $("#auGo"); go.disabled = true; msg(mode === "up" ? "Creating your account…" : "Signing in…");
        try {
          let cred;
          if (mode === "up") { cred = await M.auth.createUserWithEmailAndPassword(FB.au, em, pw); if (nm) { try { await M.auth.updateProfile(cred.user, { displayName: nm }); } catch (_) {} } }
          else cred = await M.auth.signInWithEmailAndPassword(FB.au, em, pw);
          try { localStorage.removeItem(SKIP); } catch (_) {}
          const res = await finish(cred.user, t => msg(t));
          if (mode === "up" && nm) { try { await res.db.doc("data/users/" + cred.user.uid + "/profile").get().then(s => s.exists ? null : res.db.doc("data/users/" + cred.user.uid + "/profile").set({ nick: nm })); } catch (_) {} }
          el.remove(); resolve(res);
        } catch (e) { go.disabled = false; msg(ERR[e.code] || "Something went wrong. Try again.", true); }
      };
      setTimeout(() => $("#auEmail").focus(), 50);
    });
  }

  let STATE = "starting", ERRMSG = "";
  window.CAC_ACCOUNT = () => ({ email: CUR ? CUR.email : null, state: STATE, err: ERRMSG });
  window.CAC_SIGNOUT = async () => { try { await M.auth.signOut(FB.au); } catch (_) {} try { localStorage.removeItem(SKIP); } catch (_) {} location.reload(); };
  window.CAC_SIGNIN = () => { try { localStorage.removeItem(SKIP); } catch (_) {} location.reload(); };
  window.CAC_AUTH = async () => {
    STATE = "loading";
    try { await withTimeout(load(), 15000); }
    catch (e) { STATE = "error"; ERRMSG = (e && (e.message || e.code)) || String(e);   // offline or blocked: on-phone mode, but say so
      setTimeout(() => { try { toast("Couldn't reach the sign-in service. Using this iPhone only for now."); } catch (_) {} }, 2500); return null; }
    STATE = "ready";
    let redirErr = null; try { await M.auth.getRedirectResult(FB.au); } catch (e) { redirErr = e; }
    const u = await new Promise(r => { const off = M.auth.onAuthStateChanged(FB.au, x => { off(); r(x); }); });
    if (u) return finish(u, () => {});
    let skip = false; try { skip = !!localStorage.getItem(SKIP); } catch (_) {}
    if (skip) return null;
    const sc = screen(); if (redirErr && redirErr.code) setTimeout(() => { const m = document.getElementById("auMsg"); if (m) { m.textContent = ERR[redirErr.code] || ("Google sign-in didn't finish (" + redirErr.code + "). Try again or use email."); m.classList.add("err"); } }, 60);
    return sc;
  };
})();

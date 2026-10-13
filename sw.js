/* Calisthenics Academy Coach: offline support. The app shell is cached so it opens with no signal;
   pages come from the network first so updates arrive, fonts are cached after first use. */
const CACHE="cac-d8bed352dd";
const SHELL=["./","./index.html","./manifest.webmanifest","./icons/apple-touch-icon.png","./icons/icon-192.png","./icons/icon-512.png","./auth.js?v=d8bed352dd","./firebase-config.js?v=d8bed352dd"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL.map(u=>new Request(u,{cache:"reload"})))).then(()=>self.skipWaiting()))});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE&&k.startsWith("cac-")&&k!=="cac-fonts"&&k!=="cac-libs").map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener("fetch",e=>{
  const r=e.request;if(r.method!=="GET")return;
  const u=new URL(r.url);
  if(r.mode==="navigate"){
    e.respondWith(fetch(r,{cache:"no-store"}).then(res=>{const c=res.clone();caches.open(CACHE).then(k=>k.put("./index.html",c));return res}).catch(()=>caches.match("./index.html")));return}
  if(u.origin===location.origin){e.respondWith(caches.match(r).then(m=>m||fetch(r).then(res=>{const c=res.clone();caches.open(CACHE).then(k=>k.put(r,c));return res})));return}
  if(u.hostname==="www.gstatic.com"&&u.pathname.startsWith("/firebasejs/")){e.respondWith(caches.open("cac-libs").then(k=>k.match(r).then(m=>m||fetch(r).then(res=>{k.put(r,res.clone());return res}))));return}
  if(/fonts\.(googleapis|gstatic)\.com$/.test(u.hostname)){
    e.respondWith(caches.open("cac-fonts").then(k=>k.match(r).then(m=>{const net=fetch(r).then(res=>{k.put(r,res.clone());return res}).catch(()=>m);return m||net})))}
});

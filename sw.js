/* SR Programma · service worker · oflayn rejim */
const VER='sr-25c42a59f',SHELL=["index.html", "manifest.webmanifest", "icon-192.png", "icon-512.png", "apple-touch-icon.png"].map(f=>'./'+f).concat(['./']);
const PDFC='sr-books',RT='sr-runtime';
self.addEventListener('install',e=>{e.waitUntil(caches.open(VER).then(c=>Promise.allSettled(SHELL.map(u=>c.add(u)))).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith('sr-')&&![VER,PDFC,RT].includes(k)).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
const API=/supabase\.co|api\.brave|accounts\.google|mymemory|googleusercontent|google\.com\/s2\/favicons/i;
self.addEventListener('fetch',e=>{
  const r=e.request,u=new URL(r.url);
  if(r.method!=='GET'||API.test(u.href))return;                 // API va kirish so'rovlari kesh qilinmaydi
  if(r.mode==='navigate'){e.respondWith(fetch(r).then(x=>{if(x.ok){const c=x.clone();caches.open(VER).then(k=>k.put('./',c))}return x}).catch(()=>caches.match('./')));return}
  if(r.headers.has('range'))return;                             // PDF bo'laklari to'g'ridan-to'g'ri tarmoqdan
  if(u.origin===location.origin&&/\.pdf$/i.test(u.pathname)){    // kitoblar: bir marta ochilsa, oflayn ham ochiladi
    e.respondWith(caches.open(PDFC).then(c=>c.match(r).then(m=>m||fetch(r).then(x=>{if(x.ok&&x.status===200)c.put(r,x.clone());return x}))));return}
  if(u.origin===location.origin){                                // dastur fayllari: tez ochiladi, orqada yangilanadi
    e.respondWith(caches.match(r).then(m=>{const n=fetch(r).then(x=>{if(x.ok)caches.open(VER).then(c=>c.put(r,x.clone()));return x}).catch(()=>m);return m||n}));return}
  e.respondWith(caches.open(RT).then(c=>c.match(r).then(m=>m||fetch(r).then(x=>{if(x.ok||x.type==='opaque')c.put(r,x.clone());return x}))));  // shrift, pdf.js va boshqa tashqi fayllar
});

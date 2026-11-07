/* SR Programma — avtomatik tekshiruv.  Ishga tushirish:
   node smoke.js ../index.html          (Playwright o'rnatilgan bo'lishi kerak)
   Supabase javoblari soxta (mock), haqiqiy bazaga tegmaydi. */
const { chromium } = require('playwright');
const fs = require('fs');
const file = process.argv[2] || '../index.html';
const isDir = fs.statSync(file).isDirectory();
const html = fs.readFileSync(isDir ? file + '/index.html' : file, 'utf8');
const MIME = { js: 'text/javascript', css: 'text/css', html: 'text/html', png: 'image/png', webmanifest: 'application/manifest+json' };
const SB = 'https://olqnhjokpufudfqyenwx.supabase.co';
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '  ✔ ' : '  ✘ ') + m); };

async function open(cloud) {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 800 } });
  const p = await ctx.newPage();
  const st = { loads: 0, posts: 0, errs: [] };
  p.on('pageerror', e => st.errs.push(e.message));
  p.on('framenavigated', f => { if (f === p.mainFrame()) st.loads++ });
  const empty = { set: { lang: 'uz', theme: 'tun', fs: 1 }, tasks: [], notes: [] };
  const full = { set: { lang: 'uz', theme: 'tun', fs: 1 }, tasks: [], notes: [{ id: 1, title: 'x', text: 'y', ts: 1 }] };
  await p.route('**/*', async r => {
    const u = r.request().url(), m = r.request().method();
    if (u.startsWith(SB)) {
      if (u.includes('/auth/v1/')) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ access_token: 'AT', refresh_token: 'RT', expires_in: 3600, user: { id: 'u1', email: 'a@b.co' } }) });
      if (u.includes('/rest/v1/sr_backup') && m === 'GET') {
        if (u.includes('select=updated_at')) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ updated_at: '2026-11-07T10:00:00Z' }]) });
        return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ updated_at: '2026-11-07T10:00:00Z', data: cloud === 'empty' ? empty : full }]) });
      }
      if (m === 'POST') st.posts++;
      return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }
    if (u.startsWith('http://localhost/')) {
      const pn = new URL(u).pathname; if (pn === '/') return r.fulfill({ status: 200, contentType: 'text/html', body: html });
      const fp = isDir ? file + pn : null; if (fp && fs.existsSync(fp) && fs.statSync(fp).isFile()) return r.fulfill({ status: 200, contentType: MIME[fp.split('.').pop()] || 'application/octet-stream', body: fs.readFileSync(fp) });
      return r.fulfill({ status: 404, body: '' });
    }
    return r.abort();
  });
  await p.goto('http://localhost/');
  return { b, p, st };
}
async function login(p) {
  let n = 0;
  for (let t = 0; t < 24; t++) {
    await p.waitForTimeout(500);
    const g = await p.evaluate(() => { const o = document.getElementById('srgt'); return o && !o.classList.contains('go') ? { em: !!o.querySelector('#ge'), pw: !!o.querySelector('#gp') } : null }).catch(() => null);
    if (g && g.pw) { if (g.em) await p.fill('#srgt #ge', 'a@b.co'); await p.fill('#srgt #gp', 'Parol12345'); await p.click('#srgt #gb'); n++; await p.waitForTimeout(1800) }
  }
  return n;
}

(async () => {
  console.log('1) Kirish — bulutdagi nusxa bo‘sh (oldin cheksiz aylana edi)');
  let { b, p, st } = await open('empty'); let n = await login(p);
  ok(n === 1, 'parol 1 marta so‘raldi (' + n + ')'); ok(st.loads === 1, 'sahifa qayta yuklanmadi (' + st.loads + ')'); ok(!st.errs.length, 'JS xatosi yo‘q');

  console.log('2) Bo‘sh qurilma bulutdagi to‘la nusxani ustiga yoza olmaydi');
  let blocked = false; try { await p.evaluate(() => window.srUp()) } catch (e) { blocked = /Bulutda|bulut/i.test(e.message) }
  ok(blocked, 'up() rad etildi'); ok(st.posts === 0, 'bulutga hech narsa yozilmadi (POST=' + st.posts + ')');
  console.log('3) Ma’lumot bor qurilma saqlay oladi');
  await p.evaluate(() => { D.notes.push({ id: 1, title: 'a', text: 'b', ts: 1 }) }); let up = true; try { await p.evaluate(() => window.srUp()) } catch (e) { up = false }
  ok(up && st.posts === 1, 'saqlandi (POST=' + st.posts + ')');
  console.log('3b) Nusxalar tarixi oynasi');
  await p.click('#pc'); await p.click('[data-r=cl]'); await p.waitForSelector('#chs'); await p.click('#chs'); await p.waitForTimeout(500);
  ok(/Shu qurilmadagi nusxalar/.test(await p.innerText('#vb')), 'Nusxalar tarixi ochildi'); ok(!st.errs.length, 'JS xatosi yo‘q'); await b.close();

  console.log('4) Kirish — bulutdagi nusxa to‘la');
  ({ b, p, st } = await open('full')); n = await login(p);
  ok(n === 1, 'parol 1 marta so‘raldi (' + n + ')'); ok(st.loads === 2, 'bir marta qayta yuklandi (' + st.loads + ')'); ok(!st.errs.length, 'JS xatosi yo‘q'); await b.close();

  console.log('5) Lug‘at: Takror (SM-2)');
  const dict = fs.existsSync(__dirname + '/dict.html') ? fs.readFileSync(__dirname + '/dict.html', 'utf8') : null;
  if (dict) {
    const br = await chromium.launch(); const pg = await (await br.newContext({ viewport: { width: 390, height: 800 } })).newPage(); const er = [];
    pg.on('pageerror', e => er.push(e.message));
    await pg.route('**/*', r => r.request().url() === 'http://localhost/' ? r.fulfill({ status: 200, contentType: 'text/html', body: dict }) : r.abort());
    await pg.goto('http://localhost/'); await pg.waitForTimeout(4200); await pg.click('#splash').catch(() => { }); await pg.waitForTimeout(1500);
    await pg.click('#tabs button[data-t=r]'); await pg.waitForTimeout(200);
    ok(/yangi|Yangi/i.test(await pg.innerText('#app')), 'Takror sahifasi ochildi');
    await pg.click('#sgo'); await pg.click('#shw'); await pg.click('[data-q="4"]');
    const sv = await pg.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('srt3')).srs || {}).length);
    ok(sv === 1, 'baho saqlandi (kartochka=' + sv + ')');
    const lp = await pg.evaluate(() => { const w = W[5]; lapse(w); const c = S.srs[w.k]; return c.n === 0 && c.due <= Date.now() });
    ok(lp, 'xato qilingan so‘z darhol Takror navbatiga tushdi'); ok(!er.length, 'JS xatosi yo‘q'); await br.close();
  } else console.log('  (dict.html yo‘q — o‘tkazib yuborildi)');
  console.log(`\nNatija: ${pass} o‘tdi, ${fail} muvaffaqiyatsiz`); process.exit(fail ? 1 : 0);
})();

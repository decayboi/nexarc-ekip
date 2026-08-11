/* v4.3: dinamik kamera yerleşimi — 1, 2, 3 (üçgen), 4 (2x2) + butonlar görünür */
const puppeteer = require('puppeteer');
const log = (...a) => process.stderr.write(a.join(' ') + '\n');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const URL = 'http://localhost:3000';

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new', protocolTimeout: 60000,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--mute-audio'],
  });
  // 4 kullanıcı için 4 context
  const pages = [];
  for (let i = 0; i < 4; i++) {
    const ctx = await browser.createBrowserContext();
    const p = await ctx.newPage();
    await p.setViewport({ width: 1280, height: 800 });
    p.on('pageerror', (e) => log(`[P${i} hata]`, e.message.slice(0, 120)));
    pages.push(p);
  }
  const uniq = Date.now().toString(36);
  const names = ['Ali', 'Ayse', 'Mert', 'Zeynep'];
  for (let i = 0; i < 4; i++) {
    await pages[i].goto(URL, { waitUntil: 'load', timeout: 25000 });
    await wait(500);
    await pages[i].evaluate(({ u, d }) => {
      document.querySelector('#tab-register').click();
      document.querySelector('#reg-username').value = u;
      document.querySelector('#reg-password').value = 'sifre123';
      document.querySelector('#reg-display').value = d;
      document.querySelector('#register-btn').click();
    }, { u: names[i].toLowerCase() + uniq, d: names[i] });
    await wait(1500);
  }
  const joinVoice = (p) => p.evaluate(() => {
    [...document.querySelectorAll('#voice-channels .channel')].find((x) => x.querySelector('.ch-name').textContent.trim() === 'Genel Ses').click();
  });
  for (let i = 0; i < 4; i++) { await joinVoice(pages[i]); await wait(800); }
  await wait(3000);

  // Sırayla 1, 2, 3, 4 kamera aç ve düzeni kontrol et
  const results = [];
  for (let n = 1; n <= 4; n++) {
    // n'inci kullanıcıya kadar kamera aç
    for (let i = 0; i < n; i++) {
      const alreadyOn = await pages[i].evaluate(() => window.__nexarc.cameraOn);
      if (!alreadyOn) {
        await pages[i].evaluate(() => document.querySelector('#cam-btn').click());
        await wait(900);
      }
    }
    await wait(2000);
    // İlk kullanıcının ekranından düzeni ölç
    const st = await pages[0].evaluate(() => {
      const g = document.querySelector('#cam-gallery');
      const cards = g ? [...g.querySelectorAll('.cam-card')] : [];
      const rects = cards.map((c) => { const r = c.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y) }; });
      const controls = document.querySelector('#voice-controls');
      const cr = controls.getBoundingClientRect();
      const vh = window.innerHeight;
      return {
        count: g ? g.dataset.count : 'yok',
        cards: rects.length,
        rects,
        controlsBottom: Math.round(cr.bottom),
        viewportH: vh,
        allVisible: cr.bottom <= vh + 1 && cr.top >= -1,
      };
    });
    results.push({ n, ...st });
    log(`[${n} kamera] count=${st.count} kart=${st.cards} düzen=${JSON.stringify(st.rects.map((r) => r.w + 'x' + r.h + '@' + r.x + ',' + r.y))} butonlar=${st.allVisible}`);
  }

  // Doğrulamalar
  const r1 = results[0];
  if (r1.cards !== 1 || r1.count !== '1') { log('✗ 1 kamera düzeni hatalı'); process.exit(1); }
  const r2 = results[1];
  if (r2.cards !== 2 || r2.count !== '2') { log('✗ 2 kamera düzeni hatalı'); process.exit(1); }
  if (Math.abs(r2.rects[0].y - r2.rects[1].y) > 5) { log('✗ 2 kamera yan yana değil'); process.exit(1); }
  const r3 = results[2];
  if (r3.cards !== 3 || r3.count !== '3') { log('✗ 3 kamera düzeni hatalı'); process.exit(1); }
  // Üçgen: 1. kart üstte (küçük y), 2 ve 3 altta (büyük y), 1. kart 2x geniş
  if (!(r3.rects[0].y < r3.rects[1].y && r3.rects[0].y < r3.rects[2].y)) { log('✗ 3 kamera üçgen değil (üstte 1 olmalı)'); process.exit(1); }
  if (Math.abs(r3.rects[0].y - r3.rects[1].y) < 20) { log('✗ Üst ve alt aynı satırda'); process.exit(1); }
  if (r3.rects[0].w < r3.rects[1].w * 1.7) { log('✗ Üst kart büyük değil (2x beklenir)'); process.exit(1); }
  if (Math.abs(r3.rects[1].y - r3.rects[2].y) > 5) { log('✗ Alttaki 2 kart aynı satırda değil'); process.exit(1); }
  const r4 = results[3];
  if (r4.cards !== 4 || r4.count !== '4') { log('✗ 4 kamera düzeni hatalı'); process.exit(1); }
  if (r4.rects[0].y !== r4.rects[1].y || r4.rects[2].y !== r4.rects[3].y || Math.abs(r4.rects[0].y - r4.rects[2].y) < 20) { log('✗ 4 kamera 2x2 değil'); process.exit(1); }
  if (!results.every((r) => r.allVisible)) { log('✗ Butonlar görünmüyor (bir senaryoda)'); process.exit(1); }
  log('   ✓ 1 ortada · 2 yan yana · 3 ÜÇGEN (1 üst + 2 alt) · 4 2x2 — butonlar hep görünür');

  await browser.close();
  log('\nSONUÇ: v4.3 DİNAMİK KAMERA DÜZENİ GEÇTİ ✔');
  process.exit(0);
})().catch((e) => { console.error('✗ ' + e.message); process.exit(1); });

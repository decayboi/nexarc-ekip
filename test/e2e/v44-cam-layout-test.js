/* v4.4: kamera düzeni — 3 ters üçgen (üstte 2, altta 1 ortada), 4 yatay dörtgen (2x2), çakışma yok */
const puppeteer = require('puppeteer');
const log = (...a) => process.stderr.write(a.join(' ') + '\n');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const URL = 'http://localhost:3000';

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new', protocolTimeout: 60000,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--mute-audio'],
  });
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

  // 1, 2, 3, 4 kamera sırayla
  const results = [];
  for (let n = 1; n <= 4; n++) {
    for (let i = 0; i < n; i++) {
      const alreadyOn = await pages[i].evaluate(() => window.__nexarc.cameraOn);
      if (!alreadyOn) {
        await pages[i].evaluate(() => document.querySelector('#cam-btn').click());
        await wait(900);
      }
    }
    await wait(2500);
    const st = await pages[0].evaluate(() => {
      const g = document.querySelector('#cam-gallery');
      const cards = g ? [...g.querySelectorAll('.cam-card')] : [];
      const rects = cards.map((c) => { const r = c.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y), right: Math.round(r.right), bottom: Math.round(r.bottom) }; });
      // Çakışma kontrolü: iki kartın alanı kesişiyor mu?
      let overlap = false;
      for (let i = 0; i < rects.length; i++) {
        for (let j = i + 1; j < rects.length; j++) {
          const a = rects[i], b = rects[j];
          if (a.x < b.right && b.x < a.right && a.y < b.bottom && b.y < a.bottom) overlap = true;
        }
      }
      const controls = document.querySelector('#voice-controls');
      const cr = controls.getBoundingClientRect();
      return {
        count: g ? g.dataset.count : 'yok',
        rects,
        overlap,
        controlsVisible: cr.bottom <= window.innerHeight + 1 && cr.top >= -1,
      };
    });
    results.push({ n, ...st });
    log(`[${n} kamera] count=${st.count} çakışma=${st.overlap} butonlar=${st.controlsVisible}`);
    st.rects.forEach((r, i) => log(`   kart${i + 1}: ${r.w}x${r.h} @ x=${r.x} y=${r.y}`));
  }

  // DOĞRULAMALAR
  const r3 = results[2]; // 3 kamera — TERS ÜÇGEN
  if (r3.overlap) { log('✗ 3 kamera ÇAKIŞIYOR!'); process.exit(1); }
  // Üstte 2 aynı satırda (y eşit), altta 1 ortada
  if (Math.abs(r3.rects[0].y - r3.rects[1].y) > 5) { log('✗ Üstteki 2 kamera aynı satırda değil'); process.exit(1); }
  if (r3.rects[2].y <= r3.rects[0].y) { log('✗ 3. kamera altta değil'); process.exit(1); }
  // Alttaki büyük: üsttekilerden geniş ve ortalanmış
  if (r3.rects[2].w < r3.rects[0].w * 1.5) { log('✗ Alttaki kamera büyük değil'); process.exit(1); }
  // Alttaki kartın x ortası ≈ galeri ortası
  const mid3 = r3.rects[2].x + r3.rects[2].w / 2;
  if (Math.abs(mid3 - 640) > 40) { log('✗ Alttaki kamera ortalanmamış: ' + mid3); process.exit(1); }
  log('   ✓ TERS ÜÇGEN: üstte 2 yan yana, altta 1 ortada büyük — çakışma yok');

  const r4 = results[3]; // 4 kamera — YATAY DÖRTGEN
  if (r4.overlap) { log('✗ 4 kamera ÇAKIŞIYOR!'); process.exit(1); }
  // 2x2: 1-2 aynı satır, 3-4 aynı satır, 1-3 aynı sütun
  if (Math.abs(r4.rects[0].y - r4.rects[1].y) > 5 || Math.abs(r4.rects[2].y - r4.rects[3].y) > 5) { log('✗ 4 kamera satırları hatalı'); process.exit(1); }
  if (r4.rects[2].y <= r4.rects[0].y) { log('✗ Alt satır üstte'); process.exit(1); }
  if (Math.abs(r4.rects[0].x - r4.rects[2].x) > 5 || Math.abs(r4.rects[1].x - r4.rects[3].x) > 5) { log('✗ Sütunlar hizalı değil'); process.exit(1); }
  log('   ✓ YATAY DÖRTGEN: 2 üstte + 2 altta, hizalı — çakışma yok');

  if (!results.every((r) => r.controlsVisible)) { log('✗ Butonlar görünmüyor'); process.exit(1); }
  log('   ✓ Butonlar hep görünür');

  await browser.close();
  log('\nSONUÇ: v4.4 KAMERA DÜZENİ GEÇTİ ✔');
  process.exit(0);
})().catch((e) => { console.error('✗ ' + e.message); process.exit(1); });

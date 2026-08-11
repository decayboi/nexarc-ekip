/* v4.2: kamera simetrik orta boy + butonlar HER ekran boyutunda görünür */
const puppeteer = require('puppeteer');
const log = (...a) => process.stderr.write(a.join(' ') + '\n');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const URL = 'http://localhost:3000';

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new', protocolTimeout: 60000,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--mute-audio'],
  });
  const ctxA = await browser.createBrowserContext();
  const ctxB = await browser.createBrowserContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  a.on('pageerror', (e) => log('[A hata]', e.message.slice(0, 150)));
  b.on('pageerror', (e) => log('[B hata]', e.message.slice(0, 150)));

  const uniq = Date.now().toString(36);
  const reg = async (page, u, d) => {
    await page.goto(URL, { waitUntil: 'load', timeout: 25000 });
    await wait(500);
    await page.evaluate(({ u, d }) => {
      document.querySelector('#tab-register').click();
      document.querySelector('#reg-username').value = u;
      document.querySelector('#reg-password').value = 'sifre123';
      document.querySelector('#reg-display').value = d;
      document.querySelector('#register-btn').click();
    }, { u, d });
    await wait(1500);
  };
  await reg(a, 'ali' + uniq, 'Ali');
  await reg(b, 'ayse' + uniq, 'Ayse');
  const joinVoice = (p) => p.evaluate(() => {
    [...document.querySelectorAll('#voice-channels .channel')].find((x) => x.querySelector('.ch-name').textContent.trim() === 'Genel Ses').click();
  });

  const sizes = [
    { w: 1400, h: 900, label: 'büyük ekran' },
    { w: 1200, h: 700, label: 'küçük ekran' },
    { w: 1000, h: 600, label: 'çok küçük ekran' },
  ];
  for (const sz of sizes) {
    await a.setViewport({ width: sz.w, height: sz.h });
    await b.setViewport({ width: sz.w, height: sz.h });
    // Her boyutta yeniden ses kanalına gir (görünüm tazelensin)
    await joinVoice(a); await wait(800);
    await joinVoice(b); await wait(2500);
    // İkisi de kamera açsın
    await a.evaluate(() => document.querySelector('#cam-btn').click());
    await wait(800);
    await b.evaluate(() => document.querySelector('#cam-btn').click());
    await wait(2500);

    const st = await a.evaluate(() => {
      const cards = [...document.querySelectorAll('#cam-gallery .cam-card')];
      const widths = cards.map((c) => c.offsetWidth);
      const firstW = cards[0] ? cards[0].offsetWidth : 0;
      const firstH = cards[0] ? cards[0].offsetHeight : 0;
      // Buton görünürlüğü
      const controls = document.querySelector('#voice-controls');
      const cr = controls.getBoundingClientRect();
      const mic = document.querySelector('#mic-btn').getBoundingClientRect();
      const cam = document.querySelector('#cam-btn').getBoundingClientRect();
      const share = document.querySelector('#share-btn').getBoundingClientRect();
      const vh = window.innerHeight;
      const visible = (el) => el.bottom <= vh + 1 && el.top >= -1;
      return {
        cardCount: cards.length,
        widths,
        symmetric: widths.length > 1 ? Math.abs(widths[0] - widths[1]) < 8 : true,
        medium: firstW >= 230 && firstW <= 310,
        aspectOk: Math.abs(firstW / firstH - 16 / 9) < 0.25,
        controlsBottom: Math.round(cr.bottom),
        viewportH: vh,
        allVisible: visible(cr) && visible(mic) && visible(cam) && visible(share),
      };
    });
    log(`[${sz.label} ${sz.w}x${sz.h}]`, JSON.stringify(st));
    if (st.cardCount !== 2) { log('✗ 2 kamera kartı olmalı'); process.exit(1); }
    if (!st.symmetric) { log('✗ Kartlar simetrik değil: ' + st.widths); process.exit(1); }
    if (!st.medium) { log('✗ Orta boyut değil: ' + st.widths); process.exit(1); }
    if (!st.aspectOk) { log('✗ 16:9 oranı yok'); process.exit(1); }
    if (!st.allVisible) { log('✗ BUG: Kontrol butonları ekran dışında!'); process.exit(1); }
    log('   ✓ Simetrik orta boy kartlar + butonlar görünür');
    // Kamera kapat (sonraki boyut için)
    await a.evaluate(() => document.querySelector('#cam-btn').click());
    await wait(600);
    await b.evaluate(() => document.querySelector('#cam-btn').click());
    await wait(600);
  }

  await browser.close();
  log('\nSONUÇ: v4.2 LAYOUT TESTİ GEÇTİ ✔');
  process.exit(0);
})().catch((e) => { console.error('✗ ' + e.message); process.exit(1); });

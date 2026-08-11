/* v4.5: 3 kamera EŞİT yan yana (fotoğraftaki gibi) — hepsi görünür, kaydırma gerektirmez, kendi kameram eşit */
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
  for (let i = 0; i < 3; i++) {
    const ctx = await browser.createBrowserContext();
    const p = await ctx.newPage();
    await p.setViewport({ width: 1280, height: 800 });
    pages.push(p);
  }
  const uniq = Date.now().toString(36);
  const names = ['Ali', 'Ayse', 'Mert'];
  for (let i = 0; i < 3; i++) {
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
  for (let i = 0; i < 3; i++) { await joinVoice(pages[i]); await wait(800); }
  await wait(3000);

  // 3'ü de kamera açar
  for (let i = 0; i < 3; i++) {
    await pages[i].evaluate(() => document.querySelector('#cam-btn').click());
    await wait(900);
  }
  await wait(3500);

  // Her kullanıcının ekranında 3 EŞİT kart görünmeli
  for (let i = 0; i < 3; i++) {
    const st = await pages[i].evaluate(() => {
      const g = document.querySelector('#cam-gallery');
      const cards = g ? [...g.querySelectorAll('.cam-card')] : [];
      const rects = cards.map((c) => { const r = c.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), y: Math.round(r.y), bottom: Math.round(r.bottom) }; });
      const galRect = g ? g.getBoundingClientRect() : null;
      return {
        count: g ? g.dataset.count : 'yok',
        cards: cards.length,
        rects,
        // Tüm kartlar galeri görünüm alanı içinde mi (kaydırma gerekmeden)?
        allInView: rects.length > 0 && rects.every((r) => r.bottom <= (galRect ? Math.round(galRect.bottom) : 9999) + 4 && r.y >= (galRect ? Math.round(galRect.top) : 0) - 4),
        selfCam: cards.some((c) => c.classList.contains('self-cam')),
      };
    });
    log(`[Kullanıcı ${names[i]}] count=${st.count} kart=${st.cards} boyutlar=${JSON.stringify(st.rects.map((r) => r.w + 'x' + r.h))} hepsiGörünür=${st.allInView} kendiKamera=${st.selfCam}`);
    if (st.cards !== 3) { log(`✗ ${names[i]} 3 kart görmüyor: ${st.cards}`); process.exit(1); }
    // Eşitlik: en büyük ve en küçük kart farkı < %10
    const ws = st.rects.map((r) => r.w);
    const maxW = Math.max(...ws), minW = Math.min(...ws);
    if (maxW - minW > maxW * 0.1) { log(`✗ Kartlar eşit değil: ${ws}`); process.exit(1); }
    // Aynı satırda (y eşit)
    if (Math.max(...st.rects.map((r) => r.y)) - Math.min(...st.rects.map((r) => r.y)) > 5) { log('✗ Kartlar aynı satırda değil'); process.exit(1); }
    if (!st.allInView) { log('✗ BUG: 3. kamera görünüm dışında (kaydırma gerekiyor)!'); process.exit(1); }
    if (!st.selfCam) { log('✗ Kendi kamera kartı yok'); process.exit(1); }
    log(`   ✓ 3 EŞİT kart yan yana, hepsi görünür, kendi kameram dahil (${ws.join(',')}px)`);
  }

  await browser.close();
  log('\nSONUÇ: v4.5 KAMERA DÜZENİ GEÇTİ ✔');
  process.exit(0);
})().catch((e) => { console.error('✗ ' + e.message); process.exit(1); });

#!/bin/bash
pkill -f '[n]ode server.js' 2>/dev/null
sleep 1
rm -f /home/user/nexarc-app/accounts.json
(cd /home/user/nexarc-app && nohup node server.js > /tmp/s.log 2>&1 &)
sleep 2
timeout 300 node -e "
const puppeteer = require('puppeteer');
const log = (...a) => process.stderr.write(a.join(' ') + '\n');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const browser = await puppeteer.launch({ headless: 'new', protocolTimeout: 60000, args: ['--no-sandbox','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--mute-audio'] });
  const pages = [];
  for (let i = 0; i < 4; i++) {
    const ctx = await browser.createBrowserContext();
    pages.push(await ctx.newPage());
  }
  const uniq = Date.now().toString(36);
  const names = ['Ali', 'Ayse', 'Mert', 'Zeynep'];
  for (let i = 0; i < 4; i++) {
    await pages[i].goto('http://localhost:3000', { waitUntil: 'load', timeout: 25000 });
    await wait(500);
    await pages[i].evaluate(({u,d}) => {
      document.querySelector('#tab-register').click();
      document.querySelector('#reg-username').value = u;
      document.querySelector('#reg-password').value = 'sifre123';
      document.querySelector('#reg-display').value = d;
      document.querySelector('#register-btn').click();
    }, {u: names[i].toLowerCase()+uniq, d: names[i]});
    await wait(1500);
  }
  const joinVoice = (p) => p.evaluate(() => {
    [...document.querySelectorAll('#voice-channels .channel')].find((x) => x.querySelector('.ch-name').textContent.trim() === 'Genel Ses').click();
  });
  for (const p of pages) await p.setViewport({ width: 1280, height: 800 });
  for (let i = 0; i < 4; i++) { await joinVoice(pages[i]); await wait(700); }
  await wait(2500);

  for (const n of [3, 4]) {
    for (let i = 0; i < n; i++) {
      const on = await pages[i].evaluate(() => window.__nexarc.cameraOn);
      if (!on) { await pages[i].evaluate(() => document.querySelector('#cam-btn').click()); await wait(800); }
    }
    await wait(2500);
    const st = await pages[0].evaluate(() => {
      const g = document.querySelector('#cam-gallery');
      const cards = [...g.querySelectorAll('.cam-card')];
      const rects = cards.map((c) => { const r = c.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), y: Math.round(r.y), bottom: Math.round(r.bottom) }; });
      const gr = g.getBoundingClientRect();
      const cs = getComputedStyle(g);
      const c = document.querySelector('#voice-controls').getBoundingClientRect();
      return {
        n: cards.length,
        ws: rects.map((r) => r.w),
        ys: rects.map((r) => r.y),
        scrollable: g.scrollHeight > g.clientHeight + 5,
        overflowY: cs.overflowY,
        allInView: rects.every((r) => r.bottom <= Math.round(gr.bottom) + 4 && r.y >= Math.round(gr.top) - 4),
        controlsVisible: c.bottom <= window.innerHeight + 1 && c.top >= -1,
      };
    });
    log('[' + n + ' kamera] genişlik:', JSON.stringify(st.ws), '| y:', JSON.stringify(st.ys), '| kaydırma:', st.scrollable, '| hepsiGörünür:', st.allInView, '| butonlar:', st.controlsVisible);
    if (st.scrollable) { log('✗ KAYDIRMA ÇUBUĞU VAR!'); process.exit(1); }
    if (!st.allInView) { log('✗ Hepsini görmek için kaydırma gerekiyor!'); process.exit(1); }
    if (!st.controlsVisible) { log('✗ Butonlar görünmüyor'); process.exit(1); }
    if (n === 3 && Math.min(...st.ws) < 300) { log('✗ Kameralar küçük: ' + st.ws); process.exit(1); }
    log('   ✓ Kaydırma yok, hepsi görünür, butonlar yerinde');
  }
  log('✓ 3 ve 4 kamera: kaydırmasız, ortalanmış, hepsi görünür');
  await browser.close();
  log('BİTTİ');
})().catch((e) => { console.error('✗ ' + e.message); process.exit(1); });
" 2>&1
pkill -f '[n]ode server.js' 2>/dev/null

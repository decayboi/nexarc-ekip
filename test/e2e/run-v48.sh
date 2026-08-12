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
  for (let i = 0; i < 3; i++) {
    const ctx = await browser.createBrowserContext();
    pages.push(await ctx.newPage());
  }
  const uniq = Date.now().toString(36);
  const names = ['Ali', 'Ayse', 'Mert'];
  for (let i = 0; i < 3; i++) {
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
  for (const sz of [{w:1600,h:900,label:'büyük'}, {w:1280,h:800,label:'orta'}]) {
    for (const p of pages) await p.setViewport({ width: sz.w, height: sz.h });
    for (let i = 0; i < 3; i++) { await joinVoice(pages[i]); await wait(700); }
    await wait(2500);
    for (let i = 0; i < 3; i++) {
      await pages[i].evaluate(() => document.querySelector('#cam-btn').click());
      await wait(800);
    }
    await wait(3000);
    const st = await pages[0].evaluate(() => {
      const cards = [...document.querySelectorAll('#cam-gallery .cam-card')];
      const ws = cards.map((c) => Math.round(c.getBoundingClientRect().width));
      const controls = document.querySelector('#voice-controls').getBoundingClientRect();
      return {
        ws,
        inVoice: document.body.classList.contains('in-voice'),
        sidebarsHidden: getComputedStyle(document.querySelector('#channels-sidebar')).display === 'none',
        mainW: Math.round(document.querySelector('#main').getBoundingClientRect().width),
        controlsVisible: controls.bottom <= window.innerHeight + 1 && controls.top >= -1,
      };
    });
    log('[' + sz.label + ' ' + sz.w + 'px] kartlar:', JSON.stringify(st.ws), '| paneller gizli:', st.sidebarsHidden, '| ana alan:', st.mainW, 'px | butonlar:', st.controlsVisible);
    if (!st.sidebarsHidden) { log('✗ Paneller gizlenmedi'); process.exit(1); }
    if (st.ws.length !== 3) { log('✗ 3 kart yok'); process.exit(1); }
    if (Math.min(...st.ws) < 300) { log('✗ Kameralar hala küçük (' + st.ws + ')'); process.exit(1); }
    if (!st.controlsVisible) { log('✗ Butonlar görünmüyor'); process.exit(1); }
    // Metin kanalına geçince paneller geri gelir
    await pages[0].evaluate(() => { [...document.querySelectorAll('#text-channels .channel')].find((x) => x.querySelector('.ch-name').textContent.trim() === 'genel').click(); });
    await wait(600);
    const back = await pages[0].evaluate(() => getComputedStyle(document.querySelector('#channels-sidebar')).display !== 'none');
    if (!back) { log('✗ Metin kanalına dönünce paneller geri gelmedi'); process.exit(1); }
    // Kamera kapat ve tekrar ses kanalına gir (sonraki boyut)
    for (let i = 0; i < 3; i++) { await pages[i].evaluate(() => document.querySelector('#cam-btn').click()); await wait(400); }
  }
  log('✓ Kameralar BÜYÜK (>300px), paneller ses görünümünde gizli, metin kanalında geri geliyor');
  await browser.close();
  log('BİTTİ');
})().catch((e) => { console.error('✗ ' + e.message); process.exit(1); });
" 2>&1
pkill -f '[n]ode server.js' 2>/dev/null

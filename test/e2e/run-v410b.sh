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
  for (const p of pages) await p.setViewport({ width: 1280, height: 800 });
  for (let i = 0; i < 3; i++) { await joinVoice(pages[i]); await wait(700); }
  await wait(2500);
  for (let i = 0; i < 3; i++) {
    await pages[i].evaluate(() => document.querySelector('#cam-btn').click());
    await wait(800);
  }
  await wait(2500);
  const st = await pages[0].evaluate(() => {
    const g = document.querySelector('#cam-gallery');
    const cards = [...g.querySelectorAll('.cam-card')];
    const ws = cards.map((c) => Math.round(c.getBoundingClientRect().width));
    const ys = cards.map((c) => Math.round(c.getBoundingClientRect().y));
    const gr = g.getBoundingClientRect();
    const c = document.querySelector('#voice-controls').getBoundingClientRect();
    return {
      ws, ys,
      scrollable: g.scrollHeight > g.clientHeight + 5,
      allInView: [...cards].every((el) => { const r = el.getBoundingClientRect(); return r.bottom <= Math.round(gr.bottom) + 4 && r.y >= Math.round(gr.top) - 4; }),
      controlsVisible: c.bottom <= window.innerHeight + 1 && c.top >= -1,
      sameRow: Math.max(...ys) - Math.min(...ys) <= 5,
    };
  });
  log('3 kamera → genişlik:', JSON.stringify(st.ws), '| y:', JSON.stringify(st.ys), '| kaydırma:', st.scrollable, '| hepsiGörünür:', st.allInView, '| aynı satır:', st.sameRow, '| butonlar:', st.controlsVisible);
  if (st.scrollable || !st.allInView || !st.sameRow || !st.controlsVisible) { log('✗ HATA'); process.exit(1); }
  if (Math.min(...st.ws) < 320) { log('✗ Hâlâ küçük: ' + st.ws); process.exit(1); }
  log('✓ Kameralar ' + Math.min(...st.ws) + 'px — kaydırmasız, ortalanmış, aynı satırda');
  await browser.close();
  log('BİTTİ');
})().catch((e) => { console.error('✗ ' + e.message); process.exit(1); });
" 2>&1
pkill -f '[n]ode server.js' 2>/dev/null

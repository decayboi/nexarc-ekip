#!/bin/bash
pkill -f '[n]ode server.js' 2>/dev/null
sleep 1
rm -f /home/user/nexarc-app/accounts.json
(cd /home/user/nexarc-app && nohup node server.js > /tmp/s.log 2>&1 &)
sleep 2
timeout 200 node -e "
const puppeteer = require('puppeteer');
const log = (...a) => process.stderr.write(a.join(' ') + '\n');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const browser = await puppeteer.launch({ headless: 'new', protocolTimeout: 60000, args: ['--no-sandbox','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--mute-audio','--window-size=1600,900'] });
  const ctx = await browser.createBrowserContext();
  const p = await ctx.newPage();
  await p.setViewport({ width: 1600, height: 900 });
  await p.goto('http://localhost:3000', { waitUntil: 'load', timeout: 25000 });
  await wait(500);
  await p.evaluate((u) => {
    document.querySelector('#tab-register').click();
    document.querySelector('#reg-username').value = u;
    document.querySelector('#reg-password').value = 'sifre123';
    document.querySelector('#reg-display').value = 'Test';
    document.querySelector('#register-btn').click();
  }, 'test' + Date.now().toString(36));
  await p.waitForSelector('#app:not(.hidden)', { timeout: 15000 });
  await wait(500);
  const st = await p.evaluate(() => {
    const app = document.querySelector('#app').getBoundingClientRect();
    return {
      appW: Math.round(app.width),
      viewportW: window.innerWidth,
      leftGap: Math.round(app.left),
      rightGap: Math.round(window.innerWidth - app.right),
      ratio: Math.round((app.width / window.innerWidth) * 100) + '%',
      centered: Math.abs(app.left - (window.innerWidth - app.right)) < 5,
    };
  });
  log('Layout:', JSON.stringify(st));
  if (!st.centered) { log('✗ Ortalanmamış'); process.exit(1); }
  if (st.leftGap < 40) { log('✗ Kenar boşluğu yok (hala %100)'); process.exit(1); }
  if (st.ratio !== '80%' && Math.abs(parseInt(st.ratio) - 80) > 3) { log('✗ Oran %80 değil: ' + st.ratio); process.exit(1); }
  log('✓ Site %80 genişlikte, ortalanmış, kenar boşlukları: ' + st.leftGap + 'px');
  await browser.close();
  log('BİTTİ');
})().catch((e) => { console.error('✗ ' + e.message); process.exit(1); });
" 2>&1
pkill -f '[n]ode server.js' 2>/dev/null

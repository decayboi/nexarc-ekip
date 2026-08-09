/* v2.3 doğrulama: logo, chat auto-scroll, ayrıl butonu ikonu */
const puppeteer = require('puppeteer');
const log = (...a) => process.stderr.write(a.join(' ') + '\n');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new', protocolTimeout: 30000,
    args: ['--no-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--mute-audio', '--window-size=1280,800'],
  });
  const p1 = await browser.newPage();
  await p1.setViewport({ width: 1280, height: 800 });

  // 1) Giriş ekranı — logo görünüyor mu?
  await p1.goto('http://localhost:3000', { waitUntil: 'load', timeout: 20000 });
  await wait(500);
  const logoLogin = await p1.evaluate(() => {
    const img = document.querySelector('.brand-logo');
    if (!img) return 'YOK';
    return 'var, src=' + img.src.split('/').pop() + ', boyut=' + img.naturalWidth + 'x' + img.naturalHeight;
  });
  log('1. Giriş ekranı logo:', logoLogin);
  await p1.screenshot({ path: '/home/user/dogrulama-1-giris.png' });

  // 2) Giriş yap → kenar çubuğu logosu
  await p1.evaluate(() => { document.querySelector('#login-name').value = 'TestKullanici'; document.querySelector('#login-btn').click(); });
  await p1.waitForSelector('#app:not(.hidden)', { timeout: 10000 });
  await wait(400);
  const logoSide = await p1.evaluate(() => {
    const img = document.querySelector('.server-logo');
    return img ? 'var, boyut=' + img.naturalWidth + 'x' + img.naturalHeight : 'YOK';
  });
  log('2. Kenar çubuğu logo:', logoSide);
  const ver = await p1.evaluate(() => document.querySelector('.ver-tag')?.textContent);
  log('   Sürüm:', ver);

  // 3) Ses kanalı → ayrıl butonu ikonu
  await p1.evaluate(() => {
    const btns = [...document.querySelectorAll('#voice-channels .channel')];
    btns.find((b) => b.querySelector('.ch-name').textContent.trim() === 'Genel Ses').click();
  });
  await wait(1500);
  const leaveBtn = await p1.evaluate(() => {
    const b = document.querySelector('#leave-btn');
    return { svg: b.querySelectorAll('svg').length, text: b.textContent.trim().slice(0, 40) };
  });
  log('3. Ayrıl butonu:', JSON.stringify(leaveBtn));

  // 4) Chat auto-scroll — 20 mesaj at, scrollTop en altta mı?
  await p1.evaluate(() => document.querySelector('#text-channels .channel').click()); // genel kanala geç
  await wait(600);
  for (let i = 1; i <= 20; i++) {
    await p1.evaluate((n) => {
      const input = document.querySelector('#chat-input');
      input.value = 'Otomatik kaydırma testi mesajı #' + n;
      document.querySelector('#chat-form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    }, i);
    await wait(120);
  }
  await wait(800);
  const scrollInfo = await p1.evaluate(() => {
    const box = document.querySelector('#messages');
    return { scrollTop: Math.round(box.scrollTop), scrollHeight: box.scrollHeight, clientHeight: box.clientHeight };
  });
  log('4. Chat kaydırma:', JSON.stringify(scrollInfo));
  const sonMesajGorunur = await p1.evaluate(() => {
    const box = document.querySelector('#messages');
    const msgs = [...box.querySelectorAll('.msg-text')];
    const last = msgs[msgs.length - 1];
    if (!last) return false;
    const r = last.getBoundingClientRect();
    const br = box.getBoundingClientRect();
    return r.bottom <= br.bottom + 2;
  });
  log('   Son mesaj görünür mü:', sonMesajGorunur);
  await p1.screenshot({ path: '/home/user/dogrulama-2-chat.png' });

  await browser.close();
  log('BİTTİ');
})().catch((e) => { console.error('✗ ' + e.message); process.exit(1); });

/* v2.4 doğrulama: Açık tema + logo görünürlüğü */
const puppeteer = require('puppeteer');
const log = (...a) => process.stderr.write(a.join(' ') + '\n');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new', protocolTimeout: 30000,
    args: ['--no-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--mute-audio', '--window-size=1280,800'],
  });
  const p = await browser.newPage();
  await p.setViewport({ width: 1280, height: 800 });
  await p.goto('http://localhost:3000', { waitUntil: 'load', timeout: 20000 });
  await wait(600);

  // 3 temayı sırayla uygula ve logo çerçevesini ölç
  const results = [];
  for (const t of ['acik', 'koyu', 'siyah']) {
    await p.evaluate((th) => { document.body.dataset.theme = th; }, t);
    await wait(300);
    const r = await p.evaluate(() => {
      const img = document.querySelector('.brand-logo');
      const cs = getComputedStyle(img);
      const bodyBg = getComputedStyle(document.body).backgroundColor;
      return { chipBg: cs.backgroundColor, hasBg: cs.backgroundColor !== 'rgba(0, 0, 0, 0)', borderRadius: cs.borderRadius };
    });
    results.push({ tema: t, ...r, bodyBg: await p.evaluate(() => getComputedStyle(document.body).backgroundColor) });
  }
  results.forEach((r) => log(`Tema ${r.tema}: logo çerçevesi=${r.chipBg} (çerçeve var mı: ${r.hasBg}) | zemin=${r.bodyBg}`));

  // Açık temada ekran görüntüsü
  await p.evaluate(() => { document.body.dataset.theme = 'acik'; });
  await wait(400);
  await p.screenshot({ path: '/home/user/dogrulama-3-acik-tema.png' });
  log('Açık tema ekran görüntüsü alındı');

  // Giriş ekranında tema butonları
  const buttons = await p.evaluate(() => [...document.querySelectorAll('#login-theme button')].map((b) => b.dataset.themeOpt + (b.classList.contains('sel') ? '*' : '')));
  log('Tema butonları:', buttons.join(' '));

  // Açık temada içerik görünürlüğü: metin rengi vs zemin
  const lightContrast = await p.evaluate(() => {
    const cs = getComputedStyle(document.body);
    return { text: cs.color, bg: cs.backgroundColor, accent: cs.getPropertyValue('--accent') };
  });
  log('Açık tema metin/zemin:', JSON.stringify(lightContrast));

  // Giriş yapıp uygulamayı da açık temada gör
  await p.evaluate(() => { document.querySelector('#login-name').value = 'TemaTest'; document.querySelector('#login-btn').click(); });
  await p.waitForSelector('#app:not(.hidden)', { timeout: 10000 });
  await wait(600);
  const appColors = await p.evaluate(() => {
    const sidebar = getComputedStyle(document.querySelector('#server-sidebar'));
    const channel = getComputedStyle(document.querySelector('#text-channels .channel'));
    return { sidebarBg: sidebar.backgroundColor, channelColor: channel.color };
  });
  log('Açık tema uygulama:', JSON.stringify(appColors));
  await p.screenshot({ path: '/home/user/dogrulama-4-acik-uygulama.png' });

  await browser.close();
  log('BİTTİ');
})().catch((e) => { console.error('✗ ' + e.message); process.exit(1); });

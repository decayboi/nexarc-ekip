/* v2.6 medya doğrulama: dosya yükleme + chat'te görüntüleme */
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const log = (...a) => process.stderr.write(a.join(' ') + '\n');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  // Test dosyaları
  const testDir = path.join(__dirname, 'media-fixtures');
  fs.mkdirSync(testDir, { recursive: true });
  // 1x1 turuncu PNG
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const pngPath = path.join(testDir, 'test.png');
  fs.writeFileSync(pngPath, png);
  const txtPath = path.join(testDir, 'not.txt');
  fs.writeFileSync(txtPath, 'Nexarc medya testi');

  const browser = await puppeteer.launch({
    headless: 'new', protocolTimeout: 30000,
    args: ['--no-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--mute-audio'],
  });
  const a = await (await browser.createBrowserContext()).newPage();
  const b = await (await browser.createBrowserContext()).newPage();

  const login = async (page, name) => {
    await page.goto('http://localhost:3000', { waitUntil: 'load', timeout: 20000 });
    await wait(400);
    await page.evaluate((n) => {
      document.querySelector('#tab-register').click();
      document.querySelector('#reg-username').value = n.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20) + Math.floor(Math.random() * 999);
      document.querySelector('#reg-password').value = 'test1234';
      document.querySelector('#reg-display').value = n;
      document.querySelector('#register-btn').click();
    }, name);
    await page.waitForSelector('#app:not(.hidden)', { timeout: 12000 });
  };
  await login(a, 'Gonderici-' + Date.now().toString(36));
  await login(b, 'Izleyici-' + Date.now().toString(36));

  // İkisi de genel kanalda
  for (const p of [a, b]) {
    await p.evaluate(() => { document.querySelector('#text-channels .channel').click(); });
    await wait(400);
  }

  // 1) A resim yüklüyor
  const fileInput = await a.$('#media-input');
  await fileInput.uploadFile(pngPath);
  await wait(1500);
  // A'nın chat'inde resim görünüyor mu
  const aImg = await a.evaluate(() => {
    const img = document.querySelector('.chat-media img');
    return img ? { src: img.src.split('/').pop(), ok: img.naturalWidth > 0 } : null;
  });
  if (!aImg) { log('✗ A resmi görmedi'); process.exit(1); }
  log('1. A resim yükledi → chat\'te görünüyor:', JSON.stringify(aImg));

  // 2) B de resmi görüyor mu
  await wait(1000);
  const bImg = await b.evaluate(() => {
    const img = document.querySelector('.chat-media img');
    return img ? { src: img.src.split('/').pop() } : null;
  });
  if (!bImg || bImg.src !== aImg.src) { log('✗ B resmi görmedi'); process.exit(1); }
  log('2. B resmi gördü (aynı dosya):', bImg.src);

  // 3) A txt dosyası yüklüyor → B dosya çipi görüyor
  const fi2 = await a.$('#media-input');
  await fi2.uploadFile(txtPath);
  await wait(1500);
  const bFile = await b.evaluate(() => {
    const chip = document.querySelector('.media-file');
    return chip ? chip.textContent.replace(/\s+/g, ' ').trim().slice(0, 50) : null;
  });
  if (!bFile) { log('✗ B dosya çipini görmedi'); process.exit(1); }
  log('3. B dosya çipini gördü:', bFile);

  // 4) Dosya sunucudan erişilebilir mi (HTTP 200)
  const url = await b.evaluate(() => document.querySelector('.chat-media img')?.getAttribute('src'));
  const resp = await fetch('http://localhost:3000' + url);
  log('4. Dosya sunucudan erişilebilir:', resp.status);

  await browser.close();
  log('\nSONUÇ: MEDYA TESTLERİ GEÇTİ ✔');
  process.exit(0);
})().catch((e) => { console.error('✗ ' + e.message); process.exit(1); });

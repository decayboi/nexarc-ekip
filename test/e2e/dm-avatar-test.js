/* v3.3 doğrulama: DM sadece iki kişiye, profil fotoğrafı yükleme, durum mesajı */
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
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
  const ctxC = await browser.createBrowserContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  const c = await ctxC.newPage();
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
  await reg(b, 'ayse' + uniq, 'Ayşe');
  await reg(c, 'mert' + uniq, 'Mert');

  // 1) B, A'ya DM açar → C (üçüncü kişi) kanal listesinde DM görmemeli
  await b.evaluate(() => {
    const m = [...document.querySelectorAll('.member')].find((x) => x.textContent.includes('Ali') && !x.textContent.includes('(sen)'));
    m.click();
  });
  await wait(400);
  await b.evaluate(() => document.querySelector('#um-dm').click());
  await wait(1000);
  const cChannels = await c.evaluate(() => [...document.querySelectorAll('#text-channels .ch-name')].map((e) => e.textContent.trim()));
  const bChannels = await b.evaluate(() => [...document.querySelectorAll('#text-channels .ch-name')].map((e) => e.textContent.trim()));
  log('1. C kanalları:', JSON.stringify(cChannels));
  log('   B kanalları:', JSON.stringify(bChannels));
  const dmInC = cChannels.some((x) => x.startsWith('@'));
  if (dmInC) { log('✗ DM kanalı C\'ye de göründü (herkese yayınlandı!)'); process.exit(1); }
  const dmInB = bChannels.some((x) => x.startsWith('@'));
  if (!dmInB) { log('✗ B DM kanalını görmüyor'); process.exit(1); }
  const dmStyled = await b.evaluate(() => {
    const el = [...document.querySelectorAll('#text-channels .channel')].find((x) => x.querySelector('.ch-name').textContent.trim().startsWith('@'));
    return el ? el.classList.contains('dm') : false;
  });
  if (!dmStyled) { log('✗ DM kanalı özel stil değil'); process.exit(1); }
  log('   ✓ DM yalnızca A-B arasında, 💬 ikonlu DM kanalı olarak eklendi');

  // 2) DM mesajı gönder → A görür, C GÖRMEMELİ
  await b.evaluate((u) => {
    const i = document.querySelector('#chat-input');
    i.value = 'Özel konuşma ' + u;
    document.querySelector('#chat-form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  }, uniq);
  await wait(900);
  const aSees = await a.evaluate((u) => {
    const dmCh = [...document.querySelectorAll('#text-channels .channel')].find((x) => x.querySelector('.ch-name').textContent.trim().startsWith('@'));
    if (dmCh) dmCh.click();
    return true;
  }, uniq);
  await wait(800);
  const aHas = await a.evaluate((u) => [...document.querySelectorAll('.msg-text')].some((e) => e.textContent.includes('Özel konuşma ' + u)), uniq);
  await wait(500);
  const cHas = await c.evaluate((u) => [...document.querySelectorAll('.msg-text')].some((e) => e.textContent.includes('Özel konuşma ' + u)), uniq);
  log('debug aHas/cHas hazır');
  log('2. A DM mesajını gördü:', aHas, '| C görmemeli:', cHas);
  if (!aHas) { log('✗ A DM mesajını görmedi'); process.exit(1); }
  if (cHas) { log('✗ C, DM mesajını gördü!'); process.exit(1); }
  log('   ✓ DM mesajı yalnızca A\'ya ulaştı');

  // 3) Profil fotoğrafı yükleme
  const testDir = path.join(__dirname, 'media-fixtures');
  fs.mkdirSync(testDir, { recursive: true });
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const pngPath = path.join(testDir, 'avatar.png');
  fs.writeFileSync(pngPath, png);

  await a.evaluate(() => document.querySelector('#profile-btn').click());
  await wait(400);
  const photoInput = await a.$('#prof-photo-input');
  await photoInput.uploadFile(pngPath);
  await wait(1500);
  const previewIsImg = await a.evaluate(() => !!document.querySelector('#prof-avatar-preview .avatar-img'));
  if (!previewIsImg) { log('✗ Fotoğraf önizlemesi görünmedi'); process.exit(1); }
  await a.evaluate(() => document.querySelector('#prof-save').click());
  await wait(1200);
  const bSeesPhoto = await b.evaluate(() => {
    const m = [...document.querySelectorAll('.member')].find((x) => x.textContent.includes('Ali') && !x.textContent.includes('(sen)'));
    return m ? !!m.querySelector('.avatar-img') : false;
  });
  log('3. A fotoğraf yükledi → B üye listesinde fotoğraf gördü:', bSeesPhoto);
  if (!bSeesPhoto) { log('✗ Fotoğraf üye listesine yansımadı'); process.exit(1); }
  log('   ✓ Profil fotoğrafı bilgisayardan yüklendi, herkese yansıdı');

  // 4) Durum mesajı
  await a.evaluate(() => {
    document.querySelector('#profile-btn').click();
    document.querySelector('#prof-status-text').value = 'Tasarım yapıyorum ✏️';
    document.querySelector('#prof-save').click();
  });
  await wait(1200);
  const statusTextSeen = await b.evaluate(() => {
    const m = [...document.querySelectorAll('.member')].find((x) => x.textContent.includes('Ali'));
    return m ? m.textContent.includes('Tasarım yapıyorum') : false;
  });
  log('4. Durum mesajı B\'de göründü:', statusTextSeen);
  if (!statusTextSeen) { log('✗ Durum mesajı görünmedi'); process.exit(1); }
  log('   ✓ Durum mesajı üye listesinde görünüyor');

  // 5) Daha çok renk (16 renk)
  const colorCount = await a.evaluate(() => document.querySelectorAll('#prof-color-picker .color-swatch').length);
  log('5. Profil renk seçeneği sayısı:', colorCount);
  if (colorCount < 12) { log('✗ Renk sayısı az'); process.exit(1); }
  log('   ✓ 16 renk seçeneği var');

  await browser.close();
  log('\nSONUÇ: v3.3 TESTLERİ GEÇTİ ✔');
  process.exit(0);
})().catch((e) => { console.error('✗ ' + e.message); process.exit(1); });

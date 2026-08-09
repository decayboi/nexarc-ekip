/* v3.4 doğrulama: kamera kartı herkeste profil kartını gizler, küçük kamera kartları, DM ayrı bölüm */
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
  await reg(b, 'ayse' + uniq, 'Ayşe');
  const joinVoice = (p) => p.evaluate(() => {
    [...document.querySelectorAll('#voice-channels .channel')].find((x) => x.querySelector('.ch-name').textContent.trim() === 'Genel Ses').click();
  });

  // 1) A kamera açınca B ekranında A'nın profil kartı KAYBOLUR, kamera kartı görünür
  await joinVoice(a); await wait(900);
  await joinVoice(b); await wait(1800);
  await a.evaluate(() => document.querySelector('#cam-btn').click());
  await wait(3000);
  const bView = await b.evaluate(() => ({
    voiceCards: document.querySelectorAll('#voice-grid .voice-card').length,
    camCards: document.querySelectorAll('#cam-gallery .cam-card').length,
    selfCam: document.querySelectorAll('#cam-gallery .cam-card.self-cam').length,
    camW: document.querySelector('#cam-gallery .cam-card') ? document.querySelector('#cam-gallery .cam-card').offsetWidth : 0,
    camH: document.querySelector('#cam-gallery .cam-card') ? document.querySelector('#cam-gallery .cam-card').offsetHeight : 0,
    galleryVisible: !document.querySelector('#cam-gallery').classList.contains('hidden'),
  }));
  log('1. B görünümü:', JSON.stringify(bView));
  // B: 1 voice kart (kendi) + 1 kamera kartı (A'nın); A'nın profil kartı yok
  if (bView.voiceCards !== 1) { log('✗ B, A\'nın profil kartını hâlâ görüyor (kartlar=' + bView.voiceCards + ')'); process.exit(1); }
  if (bView.camCards !== 1 || bView.selfCam !== 0) { log('✗ B, A\'nın kamera kartını görmüyor'); process.exit(1); }
  if (bView.camW > 200 || bView.camH > 140) { log('✗ Kamera kartı hâlâ büyük: ' + bView.camW + 'x' + bView.camH); process.exit(1); }
  if (!bView.galleryVisible) { log('✗ Galeri görünür değil'); process.exit(1); }
  log('   ✓ B ekranında A\'nın profil kartı yok, küçük kamera kartı var (' + bView.camW + 'x' + bView.camH + ')');

  // A kendi görünümü: kendi profil kartı yok, kendi kamera kartı var, B'nin kartı var
  const aView = await a.evaluate(() => ({
    voiceCards: document.querySelectorAll('#voice-grid .voice-card').length,
    selfCam: document.querySelectorAll('#cam-gallery .cam-card.self-cam').length,
    galleryCards: document.querySelectorAll('#cam-gallery .cam-card').length,
  }));
  log('2. A görünümü:', JSON.stringify(aView));
  if (aView.voiceCards !== 1) { log('✗ A ekranında 1 voice kart olmalı (B), gelen: ' + aView.voiceCards); process.exit(1); }
  if (aView.selfCam !== 1) { log('✗ A kendi kamera kartını görmüyor'); process.exit(1); }
  log('   ✓ A: kendi profil kartı yok, kendi kamera kartı var, B\'nin kartı duruyor');

  // 2) DM ayrı bölümde
  await b.evaluate(() => {
    const m = [...document.querySelectorAll('.member')].find((x) => x.textContent.includes('Ali') && !x.textContent.includes('(sen)'));
    m.click();
  });
  await wait(400);
  await b.evaluate(() => document.querySelector('#um-dm').click());
  await wait(1000);
  const dmPlaces = await b.evaluate(() => ({
    inDmSection: [...document.querySelectorAll('#dm-list .channel .ch-name')].map((e) => e.textContent.trim()),
    inTextSection: [...document.querySelectorAll('#text-channels .channel .ch-name')].map((e) => e.textContent.trim()),
  }));
  log('3. DM konumu:', JSON.stringify(dmPlaces));
  if (!dmPlaces.inDmSection.some((x) => x.startsWith('@'))) { log('✗ DM, DOĞRUDAN MESAJLAR bölümünde değil'); process.exit(1); }
  if (dmPlaces.inTextSection.some((x) => x.startsWith('@'))) { log('✗ DM hâlâ metin kanalları arasında'); process.exit(1); }
  log('   ✓ DM, "DOĞRUDAN MESAJLAR" bölümünde (Discord gibi)');

  await browser.close();
  log('\nSONUÇ: v3.4 TESTLERİ GEÇTİ ✔');
  process.exit(0);
})().catch((e) => { console.error('✗ ' + e.message); process.exit(1); });

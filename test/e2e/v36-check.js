/* v3.6 doğrulama: kamera kapatınca diğerleri kalır, kart boyutu, logo ile DM dönüşü, hover paneli */
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

  // 1) Her ikisi de kamera açsın, sonra A kapatsın → B'nin kamerası A'da KALMALI
  await joinVoice(a); await wait(900);
  await joinVoice(b); await wait(1800);
  await a.evaluate(() => document.querySelector('#cam-btn').click());
  await wait(800);
  await b.evaluate(() => document.querySelector('#cam-btn').click());
  await wait(3000);
  const bothOpen = await a.evaluate(() => ({
    selfCam: !!document.querySelector('#cam-gallery .cam-card.self-cam'),
    otherCam: document.querySelectorAll('#cam-gallery .cam-card:not(.self-cam)').length,
  }));
  log('1a. İki kamera açık → A görünümü:', JSON.stringify(bothOpen));
  if (!bothOpen.selfCam || bothOpen.otherCam !== 1) { log('✗ İki kamera açıkken kartlar yanlış'); process.exit(1); }
  // A kamerasını kapat
  await a.evaluate(() => document.querySelector('#cam-btn').click());
  await wait(1500);
  const afterClose = await a.evaluate(() => ({
    selfCam: !!document.querySelector('#cam-gallery .cam-card.self-cam'),
    otherCam: document.querySelectorAll('#cam-gallery .cam-card:not(.self-cam)').length,
    voiceCards: document.querySelectorAll('#voice-grid .voice-card').length,
  }));
  log('1b. A kamerasını kapattı →', JSON.stringify(afterClose));
  if (afterClose.selfCam) { log('✗ Kendi kamera kartı kapanmadı'); process.exit(1); }
  if (afterClose.otherCam !== 1) { log('✗ BUG: B\'nin kamerası da kayboldu!'); process.exit(1); }
  log('   ✓ A kamerasını kapattı ama B\'nin kamerası görünmeye devam ediyor');

  // 2) Kamera kartı boyutu ~200x130
  const camSize = await a.evaluate(() => {
    const c = document.querySelector('#cam-gallery .cam-card:not(.self-cam)');
    return c ? c.offsetWidth + 'x' + c.offsetHeight : 'yok';
  });
  log('2. Kamera kartı boyutu:', camSize);
  const w = parseInt(camSize.split('x')[0], 10);
  if (isNaN(w) || w < 250) { log('✗ Boyut beklenenden küçük: ' + camSize); process.exit(1); }
  log('   ✓ Kart Discord boyutunda (' + camSize + ')');

  // 3) DM'ye geç → LOGOYA tıkla → sunucu kanallarına döner
  await a.evaluate(() => document.querySelector('#dm-nav-btn').click());
  await wait(400);
  const dmOn = await a.evaluate(() => !document.querySelector('#dm-view').classList.contains('hidden'));
  if (!dmOn) { log('✗ DM görünümü açılmadı'); process.exit(1); }
  await a.evaluate(() => document.querySelector('.server-btn').click());
  await wait(400);
  const backOn = await a.evaluate(() => ({
    serverVisible: !document.querySelector('#server-channels-view').classList.contains('hidden'),
    dmHidden: document.querySelector('#dm-view').classList.contains('hidden'),
  }));
  log('3. Logo tıklamasıyla dönüş:', JSON.stringify(backOn));
  if (!backOn.serverVisible || !backOn.dmHidden) { log('✗ Logo ile dönüş çalışmadı'); process.exit(1); }
  log('   ✓ Logo tıklanınca DM kapanıp sunucu kanalları geri geldi');

  // 4) Üye üzerine gelince KÜÇÜK panel (tam ekran değil)
  await b.evaluate(() => {
    const m = [...document.querySelectorAll('.member')].find((x) => x.textContent.includes('Ali') && !x.textContent.includes('(sen)'));
    m.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
  });
  await wait(500);
  const hoverCard = await b.evaluate(() => {
    const card = document.querySelector('#user-modal');
    const cs = getComputedStyle(card);
    return {
      visible: !card.classList.contains('hidden'),
      fullscreen: cs.inset === '0px' || card.offsetWidth > 500,
      width: card.offsetWidth,
    };
  });
  log('4. Hover paneli:', JSON.stringify(hoverCard));
  if (!hoverCard.visible) { log('✗ Hover paneli açılmadı'); process.exit(1); }
  if (hoverCard.fullscreen) { log('✗ Panel tam ekran açıldı!'); process.exit(1); }
  if (hoverCard.width > 320) { log('✗ Panel çok geniş: ' + hoverCard.width); process.exit(1); }
  log('   ✓ Küçük panel açıldı (290px, tam ekran değil)');

  // Hover'dan çıkınca kapanır
  await b.evaluate(() => {
    const m = [...document.querySelectorAll('.member')].find((x) => x.textContent.includes('Ali'));
    m.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
  });
  await wait(700);
  const closed = await b.evaluate(() => document.querySelector('#user-modal').classList.contains('hidden'));
  log('   Hover ayrılınca kapandı:', closed);
  if (!closed) { log('✗ Hover ayrılınca kapanmadı'); process.exit(1); }

  await browser.close();
  log('\nSONUÇ: v3.6 TESTLERİ GEÇTİ ✔');
  process.exit(0);
})().catch((e) => { console.error('✗ ' + e.message); process.exit(1); });

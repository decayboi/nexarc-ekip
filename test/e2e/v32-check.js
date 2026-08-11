/* v3.2 doğrulama: kamera açıkken kendi kartı gizli, gönder ikonu, ses pop-up'ı */
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

  // 1) Kamera açıkken kendi profil kartı gizli, sadece kamera kartı görünür
  await joinVoice(a); await wait(900);
  await joinVoice(b); await wait(1800);
  // Kamera kapalıyken: 2 kart (profil)
  const beforeCam = await a.evaluate(() => ({
    cards: document.querySelectorAll('#voice-grid .voice-card').length,
    selfCard: [...document.querySelectorAll('#voice-grid .voice-card')].some((c) => c.classList.contains('self')),
  }));
  log('1a. Kamera kapalıyken: kartlar=' + beforeCam.cards + ', kendi kartı=' + beforeCam.selfCard);
  await a.evaluate(() => document.querySelector('#cam-btn').click());
  await wait(2500);
  const afterCam = await a.evaluate(() => ({
    cards: document.querySelectorAll('#voice-grid .voice-card').length,
    selfCard: [...document.querySelectorAll('#voice-grid .voice-card')].some((c) => c.classList.contains('self')),
    selfCamCard: !!document.querySelector('.cam-card.self-cam video'),
    otherCamCard: !!document.querySelectorAll('.cam-card:not(.self-cam) video').length,
  }));
  log('1b. Kamera açıkken: kartlar=' + afterCam.cards + ', kendi kartı=' + afterCam.selfCard + ', kendi kamera=' + afterCam.selfCamCard + ', B kamerayı alıyor=' + afterCam.otherCamCard);
  if (afterCam.selfCard) { log('✗ Kamera açıkken kendi profil kartı hâlâ görünüyor'); process.exit(1); }
  if (!afterCam.selfCamCard) { log('✗ Kendi kamera kartı yok'); process.exit(1); }
  if (afterCam.cards !== 1) { log('✗ Kart sayısı 1 olmalı, gelen: ' + afterCam.cards); process.exit(1); }
  log('1. ✓ Kamera açıkken profil kartı gizli, sadece kamera görünüyor');

  // 2) Gönder butonu: küçük + kağıt uçak ikonu, "Gönder" yazısı yok
  const sendInfo = await a.evaluate(() => {
    const btn = document.querySelector('#send-btn');
    const svg = btn.querySelector('svg');
    const rect = btn.getBoundingClientRect();
    return { w: Math.round(rect.width), h: Math.round(rect.height), hasSvg: !!svg, text: btn.textContent.trim(), title: btn.getAttribute('title') };
  });
  log('2. Gönder butonu:', JSON.stringify(sendInfo));
  if (!sendInfo.hasSvg || sendInfo.text !== '' || sendInfo.w > 45 || sendInfo.h > 45) { log('✗ Gönder butonu yanlış'); process.exit(1); }
  log('   ✓ Gönder butonu küçük (40x40) ve kağıt uçak ikonlu');

  // 3) Ses seviyesi: önce A'nın kamerasını kapat (kartı geri gelsin), sonra ikon testi
  await a.evaluate(() => document.querySelector('#cam-btn').click());
  await wait(1000);
  // B'nin A'nın ses akışını ALDIĞINDAN emin ol (audioEls dolana kadar bekle)
  for (let i = 0; i < 20; i++) {
    const n = await b.evaluate(() => window.__nexarc.audioEls.size);
    if (n >= 1) break;
    await wait(500);
  }
  const volBtnExists = await b.evaluate(() => !!document.querySelector('.vol-btn'));
  if (!volBtnExists) { log('✗ Ses ikonu yok'); process.exit(1); }
  // B, A'nın kartındaki 🔊 ikonuna basar
  await b.evaluate(() => {
    const btn = document.querySelector('.vol-btn');
    btn.click();
  });
  await wait(500);
  const popState = await b.evaluate(() => ({
    visible: !document.querySelector('#vol-pop').classList.contains('hidden'),
    val: document.querySelector('#vol-pop .vp-val').textContent,
  }));
  log('3. Ses pop-up:', JSON.stringify(popState));
  if (!popState.visible) { log('✗ Ses pop-up açılmadı'); process.exit(1); }
  // Kaydırıcıyı %30'a çek
  await b.evaluate(() => {
    const slider = document.querySelector('#vol-pop input');
    slider.value = 30;
    slider.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await wait(300);
  const popVal = await b.evaluate(() => document.querySelector('#vol-pop .vp-val').textContent);
  const audioVol = await b.evaluate(() => {
    const a = [...window.__nexarc.audioEls.values()][0];
    return a ? a.volume : null;
  });
  log('   Pop-up değeri:', popVal, '| audio.volume:', audioVol);
  if (popVal !== '%30' && popVal !== '30%') { log('✗ Değer %30 olmadı: ' + popVal); process.exit(1); }
  if (audioVol !== 0.3) { log('✗ Ses seviyesi uygulanmadı: ' + audioVol); process.exit(1); }
  log('   ✓ Ses ikonu → pop-up → %30 kaydırıldı, ses 0.3 olarak uygulandı');

  await browser.close();
  log('\nSONUÇ: v3.2 TESTLERİ GEÇTİ ✔');
  process.exit(0);
})().catch((e) => { console.error('✗ ' + e.message); process.exit(1); });

/* v2.5 mobil doğrulama: hamburger menü, kanal çekmecesi, ses kanalına katılma */
const puppeteer = require('puppeteer');
const log = (...a) => process.stderr.write(a.join(' ') + '\n');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new', protocolTimeout: 30000,
    args: ['--no-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--mute-audio'],
  });
  const p = await browser.newPage();
  await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true }); // iPhone 12 boyutu
  await p.goto('http://localhost:3000', { waitUntil: 'load', timeout: 20000 });
  await wait(500);

  // 1. Giriş ekranı mobilde görünüyor mu
  const loginVisible = await p.evaluate(() => !!document.querySelector('#login-overlay:not(.hidden)'));
  log('1. Giriş ekranı görünür:', loginVisible);

  // 2. Kayıt ol / giriş yap
  await p.evaluate(() => {
    document.querySelector('#tab-register').click();
    document.querySelector('#reg-username').value = 'mobil' + Date.now().toString(36);
    document.querySelector('#reg-password').value = 'test1234';
    document.querySelector('#reg-display').value = 'MobilKullanici';
    document.querySelector('#register-btn').click();
  });
  await p.waitForSelector('#app:not(.hidden)', { timeout: 12000 });
  await wait(500);

  // 3. Hamburger butonu görünür mü (mobilde)
  const menuBtnVisible = await p.evaluate(() => {
    const b = document.querySelector('#mobile-menu-btn');
    return b && getComputedStyle(b).display !== 'none';
  });
  log('2. Hamburger butonu görünür:', menuBtnVisible);

  // 4. Hamburger'e bas → çekmece açılıyor mu
  await p.evaluate(() => document.querySelector('#mobile-menu-btn').click());
  await wait(500);
  const drawerOpen = await p.evaluate(() => document.body.classList.contains('menu-open'));
  const channelsVisible = await p.evaluate(() => {
    const vc = document.querySelector('#voice-channels');
    return vc && vc.offsetParent !== null;
  });
  log('3. Çekmece açıldı:', drawerOpen, '| Ses kanalları görünür:', channelsVisible);

  // 5. Ses kanalına dokun → katılıyor mu
  await p.evaluate(() => {
    const btns = [...document.querySelectorAll('#voice-channels .channel')];
    btns.find((b) => b.querySelector('.ch-name').textContent.trim() === 'Genel Ses').click();
  });
  await wait(1500);
  const vc = await p.evaluate(() => ({
    kanal: window.__nexarc.voiceChannel,
    mik: !!window.__nexarc.localStream,
    menuKapandi: !document.body.classList.contains('menu-open'),
  }));
  log('4. Ses kanalına katılım:', JSON.stringify(vc));

  // 6. Voice view görünüyor mu + kontroller
  const voiceView = await p.evaluate(() => {
    const vv = document.querySelector('#voice-view');
    const mic = document.querySelector('#mic-btn');
    const share = document.querySelector('#share-btn');
    return {
      voiceViewGorunur: vv && !vv.classList.contains('hidden'),
      micGorunur: mic && getComputedStyle(mic).display !== 'none',
      shareGizliMobilde: share && getComputedStyle(share).display === 'none',
    };
  });
  log('5. Ses görünümü:', JSON.stringify(voiceView));
  await p.screenshot({ path: '/home/user/dogrulama-5-mobil.png' });

  // 7. Menü tekrar açılıp metin kanalı seçilince kapanıyor mu
  await p.evaluate(() => document.querySelector('#mobile-menu-btn').click());
  await wait(300);
  await p.evaluate(() => document.querySelector('#text-channels .channel').click());
  await wait(400);
  const afterText = await p.evaluate(() => ({
    menuKapandi: !document.body.classList.contains('menu-open'),
    textView: !document.querySelector('#text-view').classList.contains('hidden'),
  }));
  log('6. Metin kanalı seçimi:', JSON.stringify(afterText));

  await browser.close();
  const okAll = loginVisible && menuBtnVisible && drawerOpen && channelsVisible && vc.kanal === 'ses-genel' && vc.mik && vc.menuKapandi && voiceView.voiceViewGorunur && voiceView.shareGizliMobilde && afterText.menuKapandi && afterText.textView;
  log(okAll ? '\nSONUÇ: MOBİL TESTLERİ GEÇTİ ✔' : '\nSONUÇ: MOBİL TEST BAŞARISIZ ✗');
  process.exit(okAll ? 0 : 1);
})().catch((e) => { console.error('✗ ' + e.message); process.exit(1); });

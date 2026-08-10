/* v3.9 doğrulama: Push to Talk, davet bağlantısı, yeni mesaj ayracı, kick */
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
  a.on('dialog', (d) => d.accept());

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
  // İlk kayıt olan admin olur → A admin
  await reg(a, 'ali' + uniq, 'Ali');
  await reg(b, 'ayse' + uniq, 'Ayşe');

  // 1) Push to Talk butonu var; açınca mikrofon track'i devre dışı, Boşluk'a basınca aktif
  const joinVoice = (p) => p.evaluate(() => {
    [...document.querySelectorAll('#voice-channels .channel')].find((x) => x.querySelector('.ch-name').textContent.trim() === 'Genel Ses').click();
  });
  await joinVoice(a); await wait(1200);
  await joinVoice(b); await wait(4000);
  const pttBtn = await a.evaluate(() => !!document.querySelector('#ptt-btn'));
  if (!pttBtn) { log('✗ PTT butonu yok'); process.exit(1); }
  // PTT aç
  await a.evaluate(() => document.querySelector('#ptt-btn').click());
  await wait(500);
  const pttState = await a.evaluate(() => ({
    active: document.querySelector('#ptt-btn').classList.contains('active'),
    trackEnabled: window.__nexarc.localStream.getAudioTracks()[0].enabled,
  }));
  log('1a. PTT açıldı:', JSON.stringify(pttState));
  if (!pttState.active || pttState.trackEnabled !== false) { log('✗ PTT açılınca mikrofon kapanmadı'); process.exit(1); }
  // Boşluk bas → konuş
  await a.keyboard.down('Space');
  await wait(300);
  const pttTalk = await a.evaluate(() => window.__nexarc.localStream.getAudioTracks()[0].enabled);
  await a.keyboard.up('Space');
  await wait(300);
  const pttStop = await a.evaluate(() => window.__nexarc.localStream.getAudioTracks()[0].enabled);
  log('1b. Boşluk basılı: ' + pttTalk + ' | bırakınca: ' + pttStop);
  if (!pttTalk || pttStop) { log('✗ PTT Boşluk çalışmıyor'); process.exit(1); }
  log('   ✓ Push to Talk çalışıyor (basılı tut → konuş, bırak → kes)');
  // PTT kapat
  await a.evaluate(() => document.querySelector('#ptt-btn').click());
  await wait(400);

  // 2) Yeni mesaj ayracı: B başka kanala geçer, A genel'e yazar → B dönünce "— Yeni —" görür
  await b.evaluate(() => { [...document.querySelectorAll('#text-channels .channel')].find((x) => x.querySelector('.ch-name').textContent.trim() === 'tasarim-akisi').click(); });
  await wait(500);
  await a.evaluate(() => { [...document.querySelectorAll('#text-channels .channel')].find((x) => x.querySelector('.ch-name').textContent.trim() === 'genel').click(); });
  await wait(500);
  await a.evaluate(() => {
    const i = document.querySelector('#chat-input');
    i.value = 'Ayraç testi ' + Date.now();
    document.querySelector('#chat-form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  });
  await wait(800);
  await b.evaluate(() => { [...document.querySelectorAll('#text-channels .channel')].find((x) => x.querySelector('.ch-name').textContent.trim() === 'genel').click(); });
  await wait(800);
  const divider = await b.evaluate(() => !!document.querySelector('.msg.new-msg'));
  log('2. Yeni mesaj ayracı:', divider);
  if (!divider) { log('✗ "— Yeni —" ayracı görünmedi'); process.exit(1); }
  log('   ✓ Yeni mesaj ayracı çalışıyor');

  // 3) Davet bağlantısı: ?join=ses-genel ile giren doğrudan ses kanalına katılır
  const ctxC = await browser.createBrowserContext();
  const c = await ctxC.newPage();
  await c.goto(URL + '/?join=ses-genel', { waitUntil: 'load', timeout: 25000 });
  await wait(500);
  await c.evaluate((u) => {
    document.querySelector('#tab-register').click();
    document.querySelector('#reg-username').value = u;
    document.querySelector('#reg-password').value = 'sifre123';
    document.querySelector('#reg-display').value = 'Mert';
    document.querySelector('#register-btn').click();
  }, 'mert' + uniq);
  await wait(2500);
  const inviteJoin = await c.evaluate(() => window.__nexarc.voiceChannel);
  log('3. Davet bağlantısı (?join=ses-genel):', inviteJoin);
  if (inviteJoin !== 'ses-genel') { log('✗ Davetle ses kanalına katılmadı'); process.exit(1); }
  log('   ✓ Linkle gelen doğrudan ses kanalına katıldı');

  // 4) Kick: A (admin), B'yi atar → B bağlantısı kopar
  await a.evaluate(() => {
    const m = [...document.querySelectorAll('.member')].find((x) => x.textContent.includes('Ayşe') && !x.textContent.includes('(sen)'));
    m.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
  });
  await wait(500);
  const kickVisible = await a.evaluate(() => {
    const k = document.querySelector('#um-kick');
    return k ? !k.classList.contains('hidden') : false;
  });
  log('4a. Admin "At" butonu görünüyor:', kickVisible);
  if (!kickVisible) { log('✗ Admin kick butonu görünmüyor'); process.exit(1); }
  await a.evaluate(() => document.querySelector('#um-kick').click());
  await wait(1500);
  const bKicked = await b.evaluate(() => !document.querySelector('#app').classList.contains('hidden') === false || true);
  // B sayfası reload olmuş olabilir; login ekranında mı kontrol et
  const bState = await b.evaluate(() => ({
    loginVisible: !document.querySelector('#login-overlay').classList.contains('hidden'),
    appHidden: document.querySelector('#app').classList.contains('hidden'),
  }));
  log('4b. B sonrası:', JSON.stringify(bState));
  if (!bState.loginVisible && !bState.appHidden) { log('✗ B atılmadı'); process.exit(1); }
  log('   ✓ Admin B\'yi attı (kick çalışıyor)');

  await browser.close();
  log('\nSONUÇ: v3.9 TESTLERİ GEÇTİ ✔');
  process.exit(0);
})().catch((e) => { console.error('✗ ' + e.message); process.exit(1); });

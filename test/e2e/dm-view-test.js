/* v3.5 doğrulama: DM ayrı görünüm (Discord gibi) */
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

  // 1) Sol şeritte DM butonu var, tıklayınca DM görünümü açılır (kanallar gizlenir)
  const dmBtnExists = await a.evaluate(() => !!document.querySelector('#dm-nav-btn'));
  if (!dmBtnExists) { log('✗ DM navigasyon butonu yok'); process.exit(1); }
  await a.evaluate(() => document.querySelector('#dm-nav-btn').click());
  await wait(500);
  const dmViewState = await a.evaluate(() => ({
    dmViewVisible: !document.querySelector('#dm-view').classList.contains('hidden'),
    serverViewHidden: document.querySelector('#server-channels-view').classList.contains('hidden'),
    btnActive: document.querySelector('#dm-nav-btn').classList.contains('active'),
  }));
  log('1. DM görünümü:', JSON.stringify(dmViewState));
  if (!dmViewState.dmViewVisible || !dmViewState.serverViewHidden || !dmViewState.btnActive) {
    log('✗ DM görünümü açılmadı'); process.exit(1);
  }
  log('   ✓ Sol şeritteki 💬 butonu → DM görünümü açıldı, kanallar gizlendi');

  // 2) DM listesinde Ayşe (hesaplı üye) görünüyor
  const dmList = await a.evaluate(() => [...document.querySelectorAll('#dm-list .channel .ch-name')].map((e) => e.textContent.trim()));
  log('2. DM listesi:', JSON.stringify(dmList));
  if (!dmList.some((x) => x.includes('Ayşe'))) { log('✗ Ayşe DM listesinde yok'); process.exit(1); }
  log('   ✓ Ayşe arkadaş listesinde görünüyor');

  // 3) Ayşe'ye tıkla → DM açılır, mesaj yazıp gönder
  await a.evaluate(() => {
    const el = [...document.querySelectorAll('#dm-list .channel')].find((x) => x.querySelector('.ch-name').textContent.includes('Ayşe'));
    el.click();
  });
  await wait(1000);
  const dmOpened = await a.evaluate(() => {
    const ch = document.querySelector('#dm-list .channel.active');
    return ch ? ch.querySelector('.ch-name').textContent.trim() : null;
  });
  log('3. Açılan DM:', dmOpened);
  if (!dmOpened || !dmOpened.startsWith('@')) { log('✗ DM açılmadı'); process.exit(1); }
  await a.evaluate((u) => {
    const i = document.querySelector('#chat-input');
    i.value = 'Merhaba DM testi ' + u;
    document.querySelector('#chat-form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  }, uniq);
  await wait(1000);
  // B de DM görünümüne geçip mesajı görsün
  await b.evaluate(() => document.querySelector('#dm-nav-btn').click());
  await wait(500);
  const bSaw = await b.evaluate(() => {
    const el = [...document.querySelectorAll('#dm-list .channel')].find((x) => x.querySelector('.ch-name').textContent.includes('@'));
    if (el) el.click();
    return !!el;
  });
  if (!bSaw) { log('✗ B DM listesinde kanal bulamadı'); process.exit(1); }
  await wait(800);
  const bHas = await b.evaluate((u) => [...document.querySelectorAll('.msg-text')].some((e) => e.textContent.includes('Merhaba DM testi ' + u)), uniq);
  log('4. B DM mesajını gördü:', bHas);
  if (!bHas) { log('✗ B mesajı görmedi'); process.exit(1); }
  log('   ✓ B DM görünümünden mesajı gördü');

  // 5) DM kapalıyken kanallar geri gelir
  await b.evaluate(() => document.querySelector('#dm-nav-btn').click());
  await wait(400);
  const backState = await b.evaluate(() => ({
    serverVisible: !document.querySelector('#server-channels-view').classList.contains('hidden'),
    dmHidden: document.querySelector('#dm-view').classList.contains('hidden'),
  }));
  log('5. Geri dönüş:', JSON.stringify(backState));
  if (!backState.serverVisible || !backState.dmHidden) { log('✗ Kanallara dönüş çalışmadı'); process.exit(1); }
  log('   ✓ DM kapatınca sunucu kanalları geri geldi');

  await browser.close();
  log('\nSONUÇ: v3.5 DM AYRI GÖRÜNÜM TESTİ GEÇTİ ✔');
  process.exit(0);
})().catch((e) => { console.error('✗ ' + e.message); process.exit(1); });

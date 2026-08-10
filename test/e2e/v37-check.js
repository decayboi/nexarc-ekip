/* v3.7 doğrulama: @bahsetme, markdown, okunmamış rozet, sağ tık menüsü, link embed, sesli mesaj */
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
  const joinText = async (p) => { await p.evaluate(() => document.querySelector('#text-channels .channel').click()); await wait(500); };
  await joinText(a); await joinText(b);

  // 1) Markdown: kalın, italik, kod, üstü çizili
  await a.evaluate(() => {
    const i = document.querySelector('#chat-input');
    i.value = '**kalın** ve *italik* ve `kod` ve ~~silinmiş~~';
    document.querySelector('#chat-form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  });
  await wait(900);
  const mdOk = await b.evaluate(() => {
    const msgs = [...document.querySelectorAll('.msg')];
    const last = msgs[msgs.length - 1];
    if (!last) return null;
    const txt = last.querySelector('.msg-text');
    return txt ? { html: txt.innerHTML.slice(0, 200), b: !!txt.querySelector('b'), i: !!txt.querySelector('i'), code: !!txt.querySelector('.md-inline'), s: !!txt.querySelector('s') } : null;
  });
  log('1. Markdown:', JSON.stringify(mdOk));
  if (!mdOk || !mdOk.b || !mdOk.i || !mdOk.code || !mdOk.s) { log('✗ Markdown çalışmıyor'); process.exit(1); }
  log('   ✓ Kalın / italik / kod / üstü çizili render ediliyor');

  // 2) @bahsetme: A, B'yi etiketler → B rozet + mention görür
  const userB = 'ayse' + uniq;
  await a.evaluate((u) => {
    const i = document.querySelector('#chat-input');
    i.value = 'Hey @' + u + ' bakar mısın?';
    document.querySelector('#chat-form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  }, userB);
  await wait(900);
  const mentionOk = await b.evaluate(() => {
    const m = document.querySelector('.mention');
    return m ? m.textContent : null;
  });
  log('2. @bahsetme: B ekranında mention:', JSON.stringify(mentionOk));
  if (!mentionOk) { log('✗ Mention render edilmedi'); process.exit(1); }
  log('   ✓ @ayse... turuncu mention olarak görünüyor');

  // 3) Okunmamış rozet: B başka kanala geçer, A yazar → B'nin genel kanalında rozet
  await b.evaluate(() => {
    const ch = [...document.querySelectorAll('#text-channels .channel')].find((x) => x.querySelector('.ch-name').textContent.trim() === 'tasarim-akisi');
    ch.click();
  });
  await wait(500);
  await a.evaluate(() => {
    const i = document.querySelector('#chat-input');
    i.value = 'Rozet testi mesajı';
    document.querySelector('#chat-form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  });
  await wait(900);
  const badgeOk = await b.evaluate(() => {
    const ch = [...document.querySelectorAll('#text-channels .channel')].find((x) => x.querySelector('.ch-name').textContent.trim() === 'genel');
    const badge = ch ? ch.querySelector('.unread-badge') : null;
    return badge ? badge.textContent : null;
  });
  log('3. Okunmamış rozet:', JSON.stringify(badgeOk));
  if (!badgeOk) { log('✗ Rozet görünmedi'); process.exit(1); }
  log('   ✓ genel kanalında rozet belirdi (' + badgeOk + ')');

  // 4) Sağ tık menüsü
  await b.evaluate(() => document.querySelector('#text-channels .channel').click()); // genel kanala dön
  await wait(600);
  const ctxOk = await b.evaluate(() => {
    const msg = document.querySelector('.msg');
    msg.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 400, clientY: 300 }));
    return true;
  });
  await wait(400);
  const ctxVisible = await b.evaluate(() => !document.querySelector('#ctx-menu').classList.contains('hidden'));
  const ctxItems = await b.evaluate(() => [...document.querySelectorAll('#ctx-menu .ctx-item')].map((e) => e.textContent));
  log('4. Sağ tık menüsü:', JSON.stringify({ visible: ctxVisible, items: ctxItems }));
  if (!ctxVisible || !ctxItems.length) { log('✗ Sağ tık menüsü açılmadı'); process.exit(1); }
  log('   ✓ Menü açıldı: ' + ctxItems.join(' | '));

  // 5) Link embed (resim linki → görsel kart)
  await a.evaluate(() => {
    const i = document.querySelector('#chat-input');
    i.value = 'Şu resme bak: https://example.com/foto.png';
    document.querySelector('#chat-form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  });
  await wait(900);
  const embedOk = await b.evaluate(() => !!document.querySelector('.chat-media img[alt="link"]'));
  log('5. Link embed (resim):', embedOk);
  if (!embedOk) { log('✗ Resim linki embed edilmedi'); process.exit(1); }
  log('   ✓ Resim linki görsel kart olarak render edildi');

  // 6) Sesli mesaj butonu var
  const vnBtn = await a.evaluate(() => !!document.querySelector('#voicenote-btn'));
  log('6. Sesli mesaj butonu:', vnBtn);
  if (!vnBtn) { log('✗ Sesli mesaj butonu yok'); process.exit(1); }
  log('   ✓ 🎤 butonu mevcut');

  await browser.close();
  log('\nSONUÇ: v3.7 YENİ ÖZELLİK TESTLERİ GEÇTİ ✔');
  process.exit(0);
})().catch((e) => { console.error('✗ ' + e.message); process.exit(1); });

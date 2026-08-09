/* v2.8 doğrulama: kanal ekle/sil, mesaj sil, emoji, kanal isimleri tam görünürlüğü */
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
  // confirm() otomatik kabul — her silme adımında once('dialog') ile açıkça beklenecek

  const uniq = Date.now().toString(36);
  const txtName = 'proje-' + uniq;
  const voiceName = 'Sunum-' + uniq;
  const reg = async (page, name, disp) => {
    await page.goto(URL, { waitUntil: 'load', timeout: 25000 });
    await wait(500);
    await page.evaluate(({ u, d }) => {
      document.querySelector('#tab-register').click();
      document.querySelector('#reg-username').value = u;
      document.querySelector('#reg-password').value = 'sifre123';
      document.querySelector('#reg-display').value = d;
      document.querySelector('#register-btn').click();
    }, { u: name, d: disp });
    await wait(1500);
    const open = await page.evaluate(() => !document.querySelector('#app').classList.contains('hidden'));
    if (!open) throw new Error(disp + ' kayıt olamadı');
  };
  await reg(a, 'ali' + uniq, 'Ali');
  await reg(b, 'ayse' + uniq, 'Ayşe');

  // 1) Kanal isimleri TAM görünüyor mu? (yan panel genişliği + textContent)
  const namesA = await a.evaluate(() => {
    const txts = [...document.querySelectorAll('#text-channels .ch-name')].map((e) => e.textContent.trim());
    const vcs = [...document.querySelectorAll('#voice-channels .ch-name')].map((e) => e.textContent.trim());
    return { txts, vcs };
  });
  log('1. Kanal isimleri:', JSON.stringify(namesA));
  const fullNames = namesA.txts.every((n) => n.length > 3) && namesA.vcs.every((n) => n.length > 3);
  const sidebarW = await a.evaluate(() => document.querySelector('#channels-sidebar').offsetWidth);
  log('   Kanal paneli genişliği:', sidebarW + 'px');
  if (!fullNames || sidebarW < 200) { log('✗ Kanal isimleri tam görünmüyor / panel dar'); process.exit(1); }

  // 2) Metin kanalı ekle → ikisi de görüyor
  await a.evaluate(() => { document.querySelector('#add-text-btn').click(); });
  await wait(300);
  await a.evaluate((n) => {
    document.querySelector('#inline-add-name').value = n;
    document.querySelector('#inline-add-ok').click();
  }, txtName);
  await wait(800);
  const textSeenB = await b.evaluate((n) => [...document.querySelectorAll('#text-channels .ch-name')].some((e) => e.textContent.trim() === n), txtName);
  if (!textSeenB) { log('✗ B yeni metin kanalını görmedi'); process.exit(1); }
  log('2. Metin kanalı eklendi → B de görüyor ("proje-ekibi")');

  // 3) Ses kanalı ekle + katıl
  await a.evaluate(() => { document.querySelector('#add-voice-btn').click(); });
  await wait(300);
  await a.evaluate((n) => {
    document.querySelector('#inline-add-name').value = n;
    document.querySelector('#inline-add-ok').click();
  }, voiceName);
  await wait(800);
  await a.evaluate((n) => {
    const btns = [...document.querySelectorAll('#voice-channels .channel')];
    btns.find((b) => b.querySelector('.ch-name').textContent.trim() === n).click();
  }, voiceName);
  await wait(1200);
  const joined = await a.evaluate(() => window.__nexarc.voiceChannel);
  if (!joined) { log('✗ Yeni ses kanalına katılınamadı'); process.exit(1); }
  log('3. Ses kanalı eklendi + katılındı ("Müşteri Sunumu")');

  // 4) B de katılıp ses kanalını silelim → B kick edilsin, kanal listeden gitsin
  await b.evaluate((n) => {
    const btns = [...document.querySelectorAll('#voice-channels .channel')];
    btns.find((b) => b.querySelector('.ch-name').textContent.trim() === n).click();
  }, voiceName);
  await wait(1200);
  const dialog4 = new Promise((res) => a.once('dialog', (d) => { d.accept(); res(true); }));
  await a.evaluate((n) => {
    const btns = [...document.querySelectorAll('#voice-channels .channel')];
    const btn = btns.find((b) => b.querySelector('.ch-name').textContent.trim() === n);
    btn.querySelector('.channel-del').click();
  }, voiceName);
  await Promise.race([dialog4, wait(3000).then(() => false)]);
  await wait(1500);
  const afterDelA = await a.evaluate((n) => ({
    vc: window.__nexarc.voiceChannel,
    kanalVar: [...document.querySelectorAll('#voice-channels .ch-name')].some((e) => e.textContent.trim() === n),
  }), voiceName);
  const afterDelB = await b.evaluate(() => window.__nexarc.voiceChannel);
  if (afterDelA.vc !== null || afterDelB !== null || afterDelA.kanalVar) {
    log('✗ Ses kanalı silinmedi / kick çalışmadı: ' + JSON.stringify({ a: afterDelA, b: afterDelB }));
    process.exit(1);
  }
  log('4. Ses kanalı silindi → A ve B otomatik çıkarıldı, listeden kayboldu');

  // 5) Mesaj silme: A mesaj atar, B görür, A siler → B'de kaybolur
  for (const p of [a, b]) {
    await p.evaluate(() => { document.querySelector('#text-channels .channel').click(); });
    await wait(500);
  }
  await a.evaluate(() => {
    const input = document.querySelector('#chat-input');
    input.value = 'Bu mesaj silinecek';
    document.querySelector('#chat-form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  });
  await wait(800);
  const seenB = await b.evaluate(() => [...document.querySelectorAll('.msg-text')].some((e) => e.textContent === 'Bu mesaj silinecek'));
  if (!seenB) { log('✗ B silinecek mesajı görmedi'); process.exit(1); }
  // A kendi mesajının çöp kutusuna basar
  await a.evaluate(() => {
    const del = document.querySelector('.msg.own .ma-del');
    if (!del) throw new Error('silme butonu yok');
    del.click();
  });
  await wait(900);
  const goneB = await b.evaluate(() => [...document.querySelectorAll('.msg-text')].every((e) => e.textContent !== 'Bu mesaj silinecek'));
  if (!goneB) { log('✗ B ekranından mesaj silinmedi'); process.exit(1); }
  const ownDelBtn = await a.evaluate(() => !!document.querySelector('.msg-del'));
  log('5. Mesaj silindi → B ekranından da kayboldu' + (ownDelBtn ? ' (silme butonu yerinde)' : ''));

  // 6) Emoji: palet açılır, emoji eklenir, mesaj gönderilir
  await a.evaluate(() => document.querySelector('#emoji-btn').click());
  await wait(400);
  const pickerVisible = await a.evaluate(() => !document.querySelector('#emoji-picker').classList.contains('hidden'));
  const emojiCount = await a.evaluate(() => document.querySelectorAll('#emoji-picker .emoji-item').length);
  if (!pickerVisible || emojiCount < 30) { log('✗ Emoji paleti açılmadı (' + emojiCount + ' emoji)'); process.exit(1); }
  await a.evaluate(() => {
    document.querySelectorAll('#emoji-picker .emoji-item')[5].click(); // 😊
  });
  await wait(300);
  const inputVal = await a.evaluate(() => document.querySelector('#chat-input').value);
  if (!inputVal.includes('😊')) { log('✗ Emoji inputa eklenmedi: "' + inputVal + '"'); process.exit(1); }
  await a.evaluate(() => {
    document.querySelector('#chat-form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  });
  await wait(800);
  const emojiSeenB = await b.evaluate(() => [...document.querySelectorAll('.msg-text')].some((e) => e.textContent.includes('😊')));
  if (!emojiSeenB) { log('✗ B emojili mesajı görmedi'); process.exit(1); }
  log('6. Emoji: palet açıldı (' + emojiCount + ' emoji), 😊 eklendi ve gönderildi → B gördü');

  // 7) Temizlik: oluşturulan metin kanalını sil (dialog'u açıkça bekle)
  const dialogP = new Promise((res) => a.once('dialog', (d) => { d.accept(); res(true); }));
  await a.evaluate((n) => {
    const btns = [...document.querySelectorAll('#text-channels .channel')];
    const btn = btns.find((b) => b.querySelector('.ch-name').textContent.trim() === n);
    if (btn) btn.querySelector('.channel-del').click();
  }, txtName);
  const gotDialog = await Promise.race([dialogP, wait(3000).then(() => false)]);
  if (!gotDialog) { log('✗ Temizlik dialogu gelmedi'); process.exit(1); }
  await wait(1500);
  const cleanedA = await a.evaluate((n) => [...document.querySelectorAll('#text-channels .ch-name')].every((e) => e.textContent.trim() !== n), txtName);
  const cleanedB = await b.evaluate((n) => [...document.querySelectorAll('#text-channels .ch-name')].every((e) => e.textContent.trim() !== n), txtName);
  if (!cleanedA || !cleanedB) { log('✗ Temizlik başarısız (A:' + cleanedA + ', B:' + cleanedB + ')'); process.exit(1); }
  log('7. Temizlik: test kanalı silindi (A ve B güncel)');

  await browser.close();
  log('\nSONUÇ: KANAL/MESAJ/EMOJİ TESTLERİ GEÇTİ ✔');
  process.exit(0);
})().catch((e) => { console.error('✗ ' + e.message); process.exit(1); });

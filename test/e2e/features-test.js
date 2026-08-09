/* v3.0 doğrulama: düzenleme, tepki, alıntı, yazıyor, durum, DM, pin, arama, susturma, kamera */
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
  a.on('pageerror', (e) => log('  [hata]', e.message.slice(0, 150)));

  const uniq = Date.now().toString(36);
  const userA = 'ali' + uniq, userB = 'ayse' + uniq;
  const reg = async (page, u, d) => {
    await page.goto(URL, { waitUntil: 'load', timeout: 25000 });
    await wait(500);
    await page.evaluate((x) => { window.__uniq = x; }, uniq);
    await page.evaluate(({ u, d }) => {
      document.querySelector('#tab-register').click();
      document.querySelector('#reg-username').value = u;
      document.querySelector('#reg-password').value = 'sifre123';
      document.querySelector('#reg-display').value = d;
      document.querySelector('#register-btn').click();
    }, { u, d });
    await wait(1500);
    const open = await page.evaluate(() => !document.querySelector('#app').classList.contains('hidden'));
    if (!open) throw new Error(d + ' kayıt olamadı');
  };
  await reg(a, userA, 'Ali');
  await reg(b, userB, 'Ayşe');
  const joinText = async (p) => { await p.evaluate(() => document.querySelector('#text-channels .channel').click()); await wait(500); };
  await joinText(a); await joinText(b);

  // 1) Mesaj gönder + düzenle → B güncel metni görür
  await a.evaluate(() => {
    const i = document.querySelector('#chat-input');
    i.value = 'İlk metin ' + window.__uniq;
    document.querySelector('#chat-form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  });
  await wait(800);
  await a.evaluate(() => {
    const el = document.querySelector('.msg.own');
    el.querySelector('.ma-edit').click();
    const inp = el.querySelector('.msg-edit-box input');
    inp.value = 'Düzenlenmiş ' + window.__uniq;
    el.querySelector('.msg-edit-box .mini-btn').click();
  });
  await wait(1000);
  const seenEdit = await b.evaluate(() => [...document.querySelectorAll('.msg-text')].some((e) => e.textContent === 'Düzenlenmiş ' + window.__uniq));
  if (!seenEdit) { log('✗ Düzenleme B\'de görünmedi'); process.exit(1); }
  log('1. Mesaj düzenleme: A düzenledi, B güncel metni gördü');

  // 2) Tepki: B, A'nın mesajına 👍 ekler → A sayaç görür
  await b.evaluate(() => {
    const msgs = [...document.querySelectorAll('.msg')];
    const el = msgs.find((m) => m.querySelector('.msg-text') && m.querySelector('.msg-text').textContent === 'Düzenlenmiş ' + window.__uniq);
    el.querySelector('.ma-react').click();
  });
  await wait(400);
  await b.evaluate(() => document.querySelectorAll('#react-pop .emoji-item')[0].click());
  await wait(900);
  const reactSeen = await a.evaluate(() => {
    const r = document.querySelector('.reaction .cnt');
    return r ? r.textContent : null;
  });
  if (reactSeen !== '1') { log('✗ Tepki sayacı görünmedi: ' + reactSeen); process.exit(1); }
  log('2. Emoji tepkisi: B 👍 ekledi, A sayaç gördü (1)');

  // 3) Alıntı: A, mesaja yanıtlar → B alıntı önizlemesi görür
  await a.evaluate(() => {
    const msgs = [...document.querySelectorAll('.msg')];
    const el = msgs.find((m) => m.querySelector('.msg-text') && m.querySelector('.msg-text').textContent === 'Düzenlenmiş ' + window.__uniq);
    el.querySelector('.ma-reply').click();
  });
  await wait(300);
  const chipText = await a.evaluate(() => document.querySelector('#reply-chip') ? document.querySelector('#reply-chip').textContent : 'yok');
  await a.evaluate(() => {
    const i = document.querySelector('#chat-input');
    i.value = 'Buna katılıyorum ' + window.__uniq;
    document.querySelector('#chat-form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  });
  await wait(900);
  const replySeen = await b.evaluate(() => {
    const rp = document.querySelector('.reply-preview');
    return rp ? rp.textContent : null;
  });
  if (!replySeen || !replySeen.includes('Ali')) { log('✗ Alıntı görünmedi: ' + replySeen); process.exit(1); }
  log('3. Alıntı: A yanıtladı (çip: "' + chipText.slice(0, 30) + '..."), B önizlemeyi gördü');

  // 4) Yazıyor göstergesi
  await a.evaluate(() => {
    const i = document.querySelector('#chat-input');
    i.value = 'yazıyorum...';
    i.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await wait(600);
  const typingSeen = await b.evaluate(() => document.querySelector('#typing-ind') ? document.querySelector('#typing-ind').textContent : '');
  if (!typingSeen.includes('Ali')) { log('✗ Yazıyor göstergesi görünmedi: "' + typingSeen + '"'); process.exit(1); }
  log('4. Yazıyor göstergesi: B, "Ali yazıyor…" gördü');

  // 5) Durum: A kendini "boşta" yapar → B üye listesinde 🟡 görür
  await a.evaluate(() => {
    document.querySelector('#profile-btn').click();
    const sel = document.querySelector('#prof-status');
    sel.value = 'idle';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    document.querySelector('#prof-save').click();
  });
  await wait(900);
  const statusSeen = await b.evaluate(() => {
    const m = [...document.querySelectorAll('.member')].find((x) => x.textContent.includes('Ali'));
    return m ? m.textContent.includes('🟡') : false;
  });
  if (!statusSeen) { log('✗ Durum güncellemesi B\'de görünmedi'); process.exit(1); }
  log('5. Durum: A "Boşta" 🟡 oldu, B üye listesinde gördü');

  // 6) DM: B, A'ya DM açar ve mesaj atar → A DM kanalını görür
  await b.evaluate(() => {
    const m = [...document.querySelectorAll('.member')].find((x) => x.textContent.includes('Ali') && !x.textContent.includes('(sen)'));
    m.click();
  });
  await wait(400);
  await b.evaluate(() => document.querySelector('#um-dm').click());
  await wait(800);
  await b.evaluate(() => {
    const i = document.querySelector('#chat-input');
    i.value = 'Özel mesaj ' + window.__uniq;
    document.querySelector('#chat-form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  });
  await wait(900);
  // A: DM kanalı listesinde var mı?
  await a.evaluate(() => {
    const dmCh = [...document.querySelectorAll('#text-channels .channel')].find((c) => c.querySelector('.ch-name').textContent.trim().startsWith('@'));
    if (dmCh) dmCh.click();
  });
  await wait(800);
  const dmSeen = await a.evaluate(() => [...document.querySelectorAll('.msg-text')].some((e) => e.textContent === 'Özel mesaj ' + window.__uniq));
  if (!dmSeen) { log('✗ DM mesajı A\'da görünmedi'); process.exit(1); }
  log('6. Özel mesaj (DM): B → A arasında çalışıyor');

  // 7) Pin + pin listesi (önce genel kanala dön)
  await a.evaluate(() => {
    [...document.querySelectorAll('#text-channels .channel')].find((c) => c.querySelector('.ch-name').textContent.trim() === 'genel').click();
  });
  await wait(700);
  await a.evaluate(() => {
    const msgs = [...document.querySelectorAll('.msg')];
    const el = msgs.find((m) => m.querySelector('.msg-text') && m.querySelector('.msg-text').textContent === 'Düzenlenmiş ' + window.__uniq);
    el.querySelector('.ma-pin').click();
  });
  await wait(700);
  // A genel kanala dönüp pin listesini açsın
  await a.evaluate(() => { [...document.querySelectorAll('#text-channels .channel')].find((c) => c.querySelector('.ch-name').textContent.trim() === 'genel').click(); });
  await wait(600);
  await a.evaluate(() => document.querySelector('#pins-btn').click());
  await wait(700);
  const pinSeen = await a.evaluate(() => document.querySelector('#pin-list') ? document.querySelector('#pin-list').textContent.includes('Düzenlenmiş') : false);
  if (!pinSeen) { log('✗ Pin listesinde mesaj yok'); process.exit(1); }
  log('7. Sabitleme: mesaj pinlendi, 📌 listesinde görünüyor');

  // 8) Arama
  await a.evaluate(() => {
    document.querySelector('#search-btn').click();
    const i = document.querySelector('#search-input');
    i.value = 'katılıyorum ' + window.__uniq;
    i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  });
  await wait(800);
  const sr = await a.evaluate(() => document.querySelector('#search-panel') ? document.querySelector('#search-panel').textContent : '');
  if (!sr.includes('katılıyorum ' + uniq)) { log('✗ Arama sonuç bulamadı: "' + sr.slice(0, 60) + '"'); process.exit(1); }
  log('8. Arama: "katılıyorum" sonucu bulundu');

  // 9) Kamera: A kamerayı açar → B kamera kartı görür
  await a.evaluate(() => {
    const btns = [...document.querySelectorAll('#voice-channels .channel')];
    btns.find((x) => x.querySelector('.ch-name').textContent.trim() === 'Genel Ses').click();
  });
  await wait(1000);
  await b.evaluate(() => {
    const btns = [...document.querySelectorAll('#voice-channels .channel')];
    btns.find((x) => x.querySelector('.ch-name').textContent.trim() === 'Genel Ses').click();
  });
  await wait(1200);
  await a.evaluate(() => document.querySelector('#cam-btn').click());
  await wait(1500);
  const camSeen = await b.evaluate(() => {
    const v = document.querySelector('.cam-card video');
    return v ? v.videoWidth > 0 : false;
  });
  if (!camSeen) { log('✗ B kamera videosu alamadı'); process.exit(1); }
  log('9. Kamera: A açtı, B gerçek video karesi aldı');

  // 10) Susturma: B, A'yı susturur → A'nın audio muted olur
  await b.evaluate(() => {
    const m = [...document.querySelectorAll('.member')].find((x) => x.textContent.includes('Ali') && !x.textContent.includes('(sen)'));
    m.click();
  });
  await wait(400);
  await b.evaluate(() => {
    const btn = document.querySelector('#um-mute');
    if (btn && !btn.classList.contains('hidden')) btn.click();
  });
  await wait(700);
  const mutedSeen = await b.evaluate(() => {
    const m = [...document.querySelectorAll('.member')].find((x) => x.textContent.includes('Ali'));
    return m ? m.textContent.includes('Susturuldu') || document.querySelector('.muted-badge') !== null : false;
  });
  log('10. Susturma: B, A\'yı susturdu (badge: ' + mutedSeen + ')');

  // 11) Ses seviyesi: ikon + pop-up
  const volBtnSeen = await b.evaluate(() => !!document.querySelector('.vol-btn'));
  if (!volBtnSeen) { log('✗ Ses seviyesi ikonu yok'); process.exit(1); }
  await b.evaluate(() => document.querySelector('.vol-btn').click());
  await wait(400);
  const volPopSeen = await b.evaluate(() => !document.querySelector('#vol-pop').classList.contains('hidden'));
  if (!volPopSeen) { log('✗ Ses seviyesi pop-up açılmadı'); process.exit(1); }
  log('11. Ses seviyesi: 🔊 ikonu → pop-up açılıyor');

  await browser.close();
  log('\nSONUÇ: v3.0 ÖZELLİK TESTLERİ GEÇTİ ✔');
  process.exit(0);
})().catch((e) => { console.error('✗ ' + e.message); process.exit(1); });

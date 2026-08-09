/* ============================================================
   NEXARC — GERÇEK TARAYICI UÇTAN UCA TESTİ (Puppeteer)
   3 ayrı Chrome sayfası: giriş → ses kanalı → gerçek WebRTC
   ses bağlantıları → sohbet → ekran paylaşımı → çıkış.
   Çalıştırma: node browser-test.js   (sunucu açıkken)
   ============================================================ */
const puppeteer = require('puppeteer');

const URL = process.env.URL || 'http://localhost:3000';
const log = (...a) => process.stderr.write(a.join(' ') + '\n');
const ok = (name) => log('✓ ' + name);
const fail = (name, e) => { console.error('✗ ' + name, e && e.message); process.exit(1); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const getState = (page) => page.evaluate(() => ({
  joined: window.__nexarc && window.__nexarc.joined,
  name: window.__nexarc && window.__nexarc.self && window.__nexarc.self.name,
  users: window.__nexarc ? window.__nexarc.users.size : 0,
  voiceChannel: window.__nexarc && window.__nexarc.voiceChannel,
  voicePeers: window.__nexarc ? window.__nexarc.voicePCs.size : 0,
  connStates: window.__nexarc
    ? [...window.__nexarc.voicePCs.values()].map((m) => m.pc.connectionState)
    : [],
  localStream: window.__nexarc && window.__nexarc.localStream ? true : false,
  micOn: window.__nexarc ? window.__nexarc.micOn : null,
  recvScreens: window.__nexarc ? window.__nexarc.screenRecvPCs.size : 0,
  recvConnStates: window.__nexarc
    ? [...window.__nexarc.screenRecvPCs.values()].map((m) => m.pc.connectionState)
    : [],
  sendScreens: window.__nexarc ? window.__nexarc.screenSendPCs.size : 0,
  screens: window.__nexarc ? window.__nexarc.screens.size : 0,
}));

async function waitFor(page, desc, cond, timeout = 25000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const s = await getState(page);
    if (cond(s)) return s;
    await wait(300);
  }
  throw new Error('zaman aşımı: ' + desc + ' → ' + JSON.stringify(await getState(page)));
}

async function login(page, name) {
  log('  [login] ' + name + ' goto...');
  await page.goto(URL, { waitUntil: 'load', timeout: 20000 });
  log('  [login] goto OK');
  await wait(400);
  log('  [login] isim set ediliyor...');
  await page.evaluate((n) => { document.querySelector('#login-name').value = n; }, name);
  log('  [login] isim set OK');
  await domClick(page, '#login-btn');
  log('  [login] katıl tıklandı');
  await page.waitForSelector('#app:not(.hidden)', { timeout: 10000 });
  log('  [login] uygulama açık');
  const s = await getState(page);
  log('  [login] durum kontrolü OK: ' + s.joined);
  if (s.joined !== true) throw new Error(name + ' giriş yapamadı');
}

async function joinVoice(page, channelName) {
  const clicked = await page.evaluate((chName) => {
    const btns = [...document.querySelectorAll('#voice-channels .channel')];
    const btn = btns.find((b) => b.querySelector('.ch-name').textContent.trim() === chName);
    if (!btn) return false;
    btn.click();
    return true;
  }, channelName);
  if (!clicked) throw new Error('ses kanalı bulunamadı: ' + channelName);
}


/* CDP Input yerine DOM click (headless'ta daha güvenilir) */
const domClick = (page, sel) => page.evaluate((s) => {
  const el = document.querySelector(s);
  if (!el) throw new Error('element yok: ' + s);
  el.click();
}, sel);

async function sendChat(page, text) {
  await page.evaluate((t) => {
    const input = document.querySelector('#chat-input');
    input.value = t;
    document.querySelector('#chat-form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  }, text);
}

async function main() {
  const browser = await puppeteer.launch({
    headless: 'new',
    protocolTimeout: 30000,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--auto-select-desktop-capture-source=Entire Screen',
      '--mute-audio',
    ],
  });

  const uniq = Date.now().toString(36);
  const pages = [await browser.newPage(), await browser.newPage(), await browser.newPage()];
  const names = ['Ali', 'Ayşe', 'Mert'].map((n) => `${n}-${uniq}`);

  try {
    /* 1. Giriş */
    for (let i = 0; i < 3; i++) {
      await login(pages[i], names[i]);
      log('  giriş: ' + names[i]);
    }
    ok('Giriş: 3 tarayıcı sayfası sunucuya katıldı');

    /* 2. Hepsi ses kanalında (mikrofon akışı da hazır olana kadar bekle) */
    for (const p of pages) await joinVoice(p, 'Genel Ses');
    for (let i = 0; i < 3; i++) {
      const s = await waitFor(pages[i], `${names[i]} ses kanalında`, (st) =>
        st.voiceChannel === 'ses-genel' && st.localStream);
      ok(`${names[i]} → ses kanalında, mikrofon akışı aktif`);
    }

    /* 3. Gerçek WebRTC: herkesin 2 peer bağlantısı connected */
    for (let i = 0; i < 3; i++) {
      const s = await waitFor(pages[i], `${names[i]} 2 ses bağlantısı`, (st) =>
        st.voicePeers === 2 && st.connStates.length === 2 && st.connStates.every((c) => c === 'connected'));
      ok(`WebRTC ses: ${names[i]} → 2 eş ile bağlantı kuruldu (${s.connStates.join(', ')})`);
    }

    /* 4. Metin sohbeti A → B, C */
    await domClick(pages[0], '#text-channels .channel');
    await wait(600);
    await sendChat(pages[0], 'Merhaba tarayıcı testi! 🧡');
    for (let i = 1; i < 3; i++) {
      await wait(500);
      const seen = await pages[i].evaluate(() =>
        [...document.querySelectorAll('.msg-text')].some((el) => el.textContent.includes('Merhaba tarayıcı testi')));
      if (!seen) throw new Error(names[i] + ' mesajı görmedi');
    }
    ok('Sohbet: A\'nın mesajı B ve C\'nin ekranında göründü');

    /* 5. Mikrofon kapat/aç (A) */
    await domClick(pages[0], '#mic-btn');
    await wait(400);
    let s = await getState(pages[0]);
    if (s.micOn !== false) throw new Error('mikrofon kapanmadı');
    await domClick(pages[0], '#mic-btn');
    await wait(400);
    s = await getState(pages[0]);
    if (s.micOn !== true) throw new Error('mikrofon açılmadı');
    ok('Mikrofon: kapat/aç çalışıyor');

    /* 6. Ekran paylaşımı (A) → B ve C alıcı bağlantı kurar */
    await domClick(pages[0], '#share-btn');
    await wait(1000);
    const sender = await getState(pages[0]);
    if (sender.sendScreens !== 2) throw new Error('paylaşan taraf 2 gönderici bağlantı kurmalı, gelen: ' + sender.sendScreens);
    ok('Ekran: A → 2 gönderici PC (B ve C)');
    for (let i = 1; i < 3; i++) {
      const ss = await waitFor(pages[i], `${names[i]} ekran alıcısı`, (st) =>
        st.recvScreens === 1 && st.recvConnStates.length === 1 && st.recvConnStates[0] === 'connected');
      ok(`Ekran: ${names[i]} → A'nın ekranını alıyor (${ss.recvConnStates[0]})`);
    }
    const areaVisible = await pages[1].evaluate(() => !document.querySelector('#screen-area').classList.contains('hidden'));
    if (!areaVisible) throw new Error('ekran alanı görünür değil');
    ok('Ekran: B\'de video alanı görünüyor');

    /* 6b. Paylaşan (A) kendi ekranını görüyor */
    const selfCard = await pages[0].evaluate(() => {
      const card = document.querySelector('.screen-card[data-peer="self"]');
      if (!card) return false;
      return card.querySelector('.screen-name').textContent.includes('Sen');
    });
    if (!selfCard) throw new Error('paylaşan kendi ekranını görmüyor');
    ok('Ekran: A kendi ekranını da görüyor ("Sen ekranını paylaşıyorsun")');

    /* 6c. İzleyen (B) ekranı büyütebiliyor (lightbox + zoom) */
    const lbOpened = await pages[1].evaluate(() => {
      const btn = document.querySelector('.screen-card .screen-btn');
      if (!btn) return false;
      btn.click();
      return true;
    });
    if (!lbOpened) throw new Error('büyüt butonu yok');
    await wait(400);
    const lbVisible = await pages[1].evaluate(() => !document.querySelector('#screen-lightbox').classList.contains('hidden'));
    if (!lbVisible) throw new Error('lightbox açılmadı');
    await domClick(pages[1], '#lb-zoom-in');
    await wait(200);
    const zoomLevel = await pages[1].evaluate(() => document.querySelector('#lightbox-video').style.transform);
    if (zoomLevel !== 'scale(1.25)') throw new Error('zoom çalışmadı: ' + zoomLevel);
    await domClick(pages[1], '#lb-close');
    await wait(300);
    const lbClosed = await pages[1].evaluate(() => document.querySelector('#screen-lightbox').classList.contains('hidden'));
    if (!lbClosed) throw new Error('lightbox kapanmadı');
    ok('Ekran: B büyütebildi (lightbox + zoom %125), kapattı');

    /* 6d. B de paylaşınca iki ekran yan yana görünür (çoklu paylaşım) */
    await domClick(pages[1], '#share-btn');
    await wait(1500);
    const bSends = await getState(pages[1]);
    if (bSends.sendScreens !== 2) throw new Error('B 2 gönderici bağlantı kurmalı, gelen: ' + bSends.sendScreens);
    const cardsA = await pages[0].evaluate(() => document.querySelectorAll('#screen-area .screen-card').length);
    if (cardsA < 2) throw new Error('A iki ekran kartı görmeli, gelen: ' + cardsA);
    ok('Ekran: A ve B aynı anda paylaşınca 2 kart yan yana (çoklu paylaşım)');
    await domClick(pages[1], '#share-btn'); // B'nin paylaşımını durdur
    await wait(600);

    /* 7. Paylaşımı durdur */
    await domClick(pages[0], '#share-btn');
    await wait(800);
    for (let i = 1; i < 3; i++) {
      const ss = await getState(pages[i]);
      if (ss.recvScreens !== 0) throw new Error(names[i] + ' alıcı PC temizlenmedi');
    }
    ok('Ekran: paylaşım durunca alıcı bağlantılar temizlendi');

    /* 8. Çıkış: B kanaldan ayrılınca A ve C'nin peer sayısı 1 olur */
    await domClick(pages[1], '#leave-btn');
    await wait(800);
    for (const idx of [0, 2]) {
      const s2 = await waitFor(pages[idx], `${names[idx]} peer=1`, (st) => st.voicePeers === 1);
      ok(`Çıkış: ${names[idx]} → B ayrılınca 1 eş kaldı (${s2.voicePeers})`);
    }

    log('\nSONUÇ: GERÇEK TARAYICI TESTİ TAMAMEN GEÇTİ ✔');
  } finally {
    for (const p of pages) await p.close().catch(() => {});
    await browser.close();
  }
}

main().catch((e) => { console.error('✗ ' + e.message); process.exit(1); });

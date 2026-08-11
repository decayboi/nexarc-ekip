/* v4.0 doğrulama: ses efektleri, anket, GIF, about me, PWA, kamera düzeni */
const puppeteer = require('puppeteer');
const log = (...a) => process.stderr.write(a.join(' ') + '\n');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const URL = 'http://localhost:3000';

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new', protocolTimeout: 60000,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--mute-audio', '--window-size=1400,900'],
  });
  const ctxA = await browser.createBrowserContext();
  const ctxB = await browser.createBrowserContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  await a.setViewport({ width: 1400, height: 900 });
  await b.setViewport({ width: 1400, height: 900 });
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

  // 1) Ses efektleri ayarı var
  await a.evaluate(() => document.querySelector('#profile-btn').click());
  await wait(400);
  const soundChk = await a.evaluate(() => !!document.querySelector('#prof-sound'));
  if (!soundChk) { log('✗ Ses efekti ayarı yok'); process.exit(1); }
  await a.evaluate(() => document.querySelector('#prof-close').click());
  await wait(300);
  log('1. ✓ Ses efekti ayarı mevcut');

  // 2) Anket: oluştur → B görür → oy verir → sayılar güncellenir
  await a.evaluate(() => document.querySelector('#poll-btn').click());
  await wait(400);
  await a.evaluate(() => {
    document.querySelector('#poll-q').value = 'Hangi tema? ' + Date.now();
    const opts = document.querySelectorAll('#poll-opts .poll-opt');
    opts[0].value = 'Koyu';
    opts[1].value = 'Açık';
    document.querySelector('#poll-create').click();
  });
  await wait(900);
  const pollSeenB = await b.evaluate(() => !!document.querySelector('.poll-box'));
  if (!pollSeenB) { log('✗ Anket B ekranında görünmedi'); process.exit(1); }
  // B oy verir
  await b.evaluate(() => document.querySelector('.poll-opt').click());
  await wait(800);
  const voteInfo = await b.evaluate(() => ({
    cnt: document.querySelector('.poll-opt-cnt').textContent,
    voted: document.querySelector('.poll-opt').classList.contains('voted'),
  }));
  log('2. Anket: B gördü, oy verdi →', JSON.stringify(voteInfo));
  if (!voteInfo.voted || !voteInfo.cnt.includes('1')) { log('✗ Anket oyu sayılmadı'); process.exit(1); }
  log('   ✓ Anket oluşturma + oylama çalışıyor');

  // 3) GIF seçici
  await a.evaluate(() => document.querySelector('#gif-btn').click());
  await wait(500);
  const gifCount = await a.evaluate(() => document.querySelectorAll('#gif-grid .gif-item').length);
  if (gifCount < 4) { log('✗ GIF listesi boş: ' + gifCount); process.exit(1); }
  await a.evaluate(() => document.querySelector('#gif-grid .gif-item').click());
  await wait(900);
  const gifSeenB = await b.evaluate(() => !!document.querySelector('.chat-media img[src*="/gifs/"]'));
  log('3. GIF: ' + gifCount + ' adet listelendi, gönderildi → B gördü:', gifSeenB);
  if (!gifSeenB) { log('✗ GIF mesajı B\'de görünmedi'); process.exit(1); }
  log('   ✓ GIF seçici + gönderim çalışıyor');

  // 4) About me: A yazar → B üye kartında görür
  await a.evaluate(() => {
    document.querySelector('#profile-btn').click();
    document.querySelector('#prof-about').value = 'Web tasarımcıyım ✏️';
    document.querySelector('#prof-save').click();
  });
  await wait(1200);
  await b.evaluate(() => {
    const m = [...document.querySelectorAll('.member')].find((x) => x.textContent.includes('Ali') && !x.textContent.includes('(sen)'));
    m.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
  });
  await wait(600);
  const aboutSeen = await b.evaluate(() => document.querySelector('.user-about') ? document.querySelector('.user-about').textContent : '');
  log('4. About me:', JSON.stringify(aboutSeen));
  if (!aboutSeen.includes('Web tasarımcıyım')) { log('✗ About me görünmedi'); process.exit(1); }
  log('   ✓ Hakkımda alanı kullanıcı kartında görünüyor');

  // 5) PWA: manifest + service worker
  const manifest = await a.evaluate(async () => {
    const r = await fetch('/manifest.json');
    const j = await r.json();
    return { name: j.name, icons: j.icons.length, sw: 'serviceWorker' in navigator };
  });
  log('5. PWA:', JSON.stringify(manifest));
  if (!manifest.name || manifest.icons !== 2 || !manifest.sw) { log('✗ PWA eksik'); process.exit(1); }
  const iconOk = await a.evaluate(async () => {
    const r = await fetch('/icons/icon-192.png');
    return r.ok;
  });
  if (!iconOk) { log('✗ İkon yok'); process.exit(1); }
  log('   ✓ Manifest + ikonlar + SW hazır (telefona kurulabilir)');

  // 6) Kamera düzeni: Discord gibi büyük karolar, ortalanmış
  const joinVoice = (p) => p.evaluate(() => {
    [...document.querySelectorAll('#voice-channels .channel')].find((x) => x.querySelector('.ch-name').textContent.trim() === 'Genel Ses').click();
  });
  await joinVoice(a); await wait(1200);
  await joinVoice(b); await wait(4000);
  await a.evaluate(() => document.querySelector('#cam-btn').click());
  await wait(2500);
  const camLayout = await a.evaluate(() => {
    const g = document.querySelector('#cam-gallery');
    const cards = g ? g.querySelectorAll('.cam-card') : [];
    const first = cards[0];
    // Butonların ekran içinde olup olmadığını kontrol et
    const controls = document.querySelector('#voice-controls');
    const cr = controls ? controls.getBoundingClientRect() : null;
    const viewportH = window.innerHeight;
    return {
      cardCount: cards.length,
      cardW: first ? first.offsetWidth : 0,
      cardH: first ? first.offsetHeight : 0,
      aspectOk: first ? Math.abs((first.offsetWidth / first.offsetHeight) - 16 / 9) < 0.3 : false,
      controlsVisible: cr ? (cr.bottom <= viewportH && cr.top >= 0) : false,
      controlsBottom: cr ? Math.round(cr.bottom) : -1,
      viewportH,
      galleryMaxH: g ? Math.round(parseFloat(getComputedStyle(g).maxHeight)) : -1,
    };
  });
  log('6. Kamera düzeni:', JSON.stringify(camLayout));
  if (camLayout.cardCount < 1 || camLayout.cardW < 240) { log('✗ Kamera kartı boyutu yanlış: ' + camLayout.cardW); process.exit(1); }
  if (!camLayout.aspectOk) { log('✗ 16:9 oranı yok'); process.exit(1); }
  if (!camLayout.controlsVisible) { log('✗ BUG: Kamera açıkken kontrol butonları ekran dışında!'); process.exit(1); }
  log('   ✓ Kameralar orta boy (' + camLayout.cardW + 'px, 16:9), butonlar görünür');

  await browser.close();
  log('\nSONUÇ: v4.0 TESTLERİ GEÇTİ ✔');
  process.exit(0);
})().catch((e) => { console.error('✗ ' + e.message); process.exit(1); });

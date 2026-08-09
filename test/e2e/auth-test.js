/* v2.7 HESAP SİSTEMİ doğrulaması: kayıt, giriş, otomatik giriş, profil güncelleme, çıkış */
const puppeteer = require('puppeteer');
const log = (...a) => process.stderr.write(a.join(' ') + '\n');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const URL = 'http://localhost:3000';

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    protocolTimeout: 60000,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--mute-audio'],
  });
  // Her kullanıcı ayrı tarayıcı context'i (ayrı localStorage) kullanır — gerçekte herkesin kendi tarayıcısı olduğu gibi
  const ctxA = await browser.createBrowserContext();
  const ctxB = await browser.createBrowserContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();

  const uniq = Date.now().toString(36);
  const userA = 'ali' + uniq;
  const userB = 'ayse' + uniq;
  log('test kullanıcıları:', userA, '/', userB);

  // 1) A kayıt oluyor
  await a.goto(URL, { waitUntil: 'load', timeout: 25000 });
  await wait(600);
  await a.evaluate(({ u }) => {
    document.querySelector('#tab-register').click();
    document.querySelector('#reg-username').value = u;
    document.querySelector('#reg-password').value = 'sifre123';
    document.querySelector('#reg-display').value = 'Ali Tasarımcı';
    document.querySelectorAll('#reg-color-picker .color-swatch')[1].click();
    document.querySelectorAll('#reg-avatar-pick .avatar-opt')[1].click();
    document.querySelector('#register-btn').click();
  }, { u: userA });
  await wait(1500);
  const afterReg = await a.evaluate(() => ({
    msg: document.querySelector('#auth-msg').textContent,
    appOpen: !document.querySelector('#app').classList.contains('hidden'),
  }));
  if (!afterReg.appOpen) { log('✗ Kayıt sonrası uygulama açılmadı → hata: "' + afterReg.msg + '"'); process.exit(1); }
  const selfA = await a.evaluate(() => ({
    name: window.__nexarc.self.name,
    username: window.__nexarc.self.username,
    avatar: window.__nexarc.self.avatar,
    color: window.__nexarc.self.color,
  }));
  if (selfA.name !== 'Ali Tasarımcı' || selfA.username !== userA || selfA.avatar !== '🦊') {
    log('✗ Kayıt profili hatalı: ' + JSON.stringify(selfA)); process.exit(1);
  }
  log('1. Kayıt: hesap oluştu → profil doğru (' + JSON.stringify(selfA) + ')');

  // 2) B kayıt olup A'yı üye listesinde görüyor
  await b.goto(URL, { waitUntil: 'load', timeout: 25000 });
  await wait(600);
  await b.evaluate((u) => {
    document.querySelector('#tab-register').click();
    document.querySelector('#reg-username').value = u;
    document.querySelector('#reg-password').value = 'sifre123';
    document.querySelector('#reg-display').value = 'Ayşe';
    document.querySelector('#register-btn').click();
  }, userB);
  await wait(1500);
  const bOpen = await b.evaluate(() => !document.querySelector('#app').classList.contains('hidden'));
  if (!bOpen) { log('✗ B kayıt olamadı'); process.exit(1); }
  await wait(700);
  const membersB = await b.evaluate(() => [...document.querySelectorAll('.member-name')].map((el) => el.textContent.trim().replace(/\s*\(sen\)$/, '')));
  if (!membersB.some((x) => x.includes('Ali Tasarımcı'))) { log('✗ B, A\'yı üye listesinde görmedi: ' + membersB.join(',')); process.exit(1); }
  log('2. Üye listesi: B, A\'yı görüyor →', membersB.join(', '));

  // 3) A profili güncelliyor → B anında yeni adı görüyor
  await a.evaluate(() => {
    document.querySelector('#profile-btn').click();
    document.querySelector('#prof-display').value = 'Ali Yeni';
    document.querySelectorAll('#prof-avatar-pick .avatar-opt')[3].click();
    document.querySelector('#prof-save').click();
  });
  await wait(1000);
  const membersB2 = await b.evaluate(() => [...document.querySelectorAll('.member-name')].map((el) => el.textContent.trim().replace(/\s*\(sen\)$/, '')));
  if (!membersB2.some((x) => x.includes('Ali Yeni'))) { log('✗ B, güncel adı görmedi: ' + membersB2.join(',')); process.exit(1); }
  log('3. Profil güncelleme: A → "Ali Yeni" 🌵, B anında gördü');

  // 4) Otomatik giriş: A sayfayı yenileyince hâlâ girişli
  await a.reload({ waitUntil: 'load', timeout: 25000 });
  await wait(1500);
  const afterReload = await a.evaluate(() => ({
    appOpen: !document.querySelector('#app').classList.contains('hidden'),
    name: window.__nexarc && window.__nexarc.self && window.__nexarc.self.name,
  }));
  if (!afterReload.appOpen || afterReload.name !== 'Ali Yeni') {
    log('✗ Otomatik giriş çalışmadı: ' + JSON.stringify(afterReload)); process.exit(1);
  }
  log('4. Otomatik giriş: sayfa yenilenince hesap korundu ("Ali Yeni")');

  // 5) Çıkış yap → giriş ekranına dön
  await a.evaluate(() => { document.querySelector('#profile-btn').click(); document.querySelector('#prof-logout').click(); });
  await wait(1500);
  const backLogin = await a.evaluate(() => !document.querySelector('#login-overlay').classList.contains('hidden'));
  if (!backLogin) { log('✗ Çıkış yapınca giriş ekranı gelmedi'); process.exit(1); }
  log('5. Çıkış yap → giriş ekranına dönüldü');

  // 6) Yanlış şifre → hata mesajı
  await a.evaluate((u) => {
    document.querySelector('#tab-login').click();
    document.querySelector('#login-username').value = u;
    document.querySelector('#login-password').value = 'yanlis';
    document.querySelector('#login-btn').click();
  }, userA);
  await wait(800);
  const errMsg = await a.evaluate(() => document.querySelector('#auth-msg').textContent);
  if (!errMsg.includes('hatalı')) { log('✗ Yanlış şifre hatası görünmedi: "' + errMsg + '"'); process.exit(1); }
  log('6. Yanlış şifre → hata mesajı: "' + errMsg + '"');

  // 7) Doğru şifreyle giriş → uygulama açıldı
  await a.evaluate((u) => {
    document.querySelector('#login-username').value = u;
    document.querySelector('#login-password').value = 'sifre123';
    document.querySelector('#login-btn').click();
  }, userA);
  await wait(1500);
  const nameAgain = await a.evaluate(() => window.__nexarc.self.name);
  if (nameAgain !== 'Ali Yeni') { log('✗ Giriş sonrası profil yanlış: ' + nameAgain); process.exit(1); }
  log('7. Giriş yap: profil korundu ("Ali Yeni")');

  // 8) Misafir girişi
  const ctxC = await browser.createBrowserContext();
  const c = await ctxC.newPage();
  await c.goto(URL, { waitUntil: 'load', timeout: 25000 });
  await wait(600);
  await c.evaluate(() => { document.querySelector('#guest-link').click(); });
  await wait(300);
  await c.evaluate(() => {
    document.querySelector('#guest-name').value = 'MisafirZiyaretci';
    document.querySelector('#guest-btn').click();
  });
  await wait(1500);
  const guestName = await c.evaluate(() => window.__nexarc.self.name);
  if (guestName !== 'MisafirZiyaretci') { log('✗ Misafir girişi hatalı'); process.exit(1); }
  log('8. Misafir girişi: "MisafirZiyaretci" olarak katıldı');

  await browser.close();
  log('\nSONUÇ: HESAP TESTLERİ TAMAMEN GEÇTİ ✔');
  process.exit(0);
})().catch((e) => { console.error('✗ ' + e.message); process.exit(1); });

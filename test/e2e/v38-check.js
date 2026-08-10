/* v3.8 doğrulama: ses→metin geçişi bağlantıyı kesmez, gürültü engelleme butonu */
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

  // 1) İkisi de ses kanalına katılır → bağlantı connected
  await joinVoice(a); await wait(1200);
  await joinVoice(b); await wait(5000);
  // ICE bağlantısının kurulması için poll et (yük altında gecikebilir)
  let conns1 = [];
  for (let i = 0; i < 20; i++) {
    conns1 = await a.evaluate(() => [...window.__nexarc.voicePCs.values()].map((m) => m.pc.connectionState));
    if (conns1.length && conns1.every((c) => c === 'connected')) break;
    await wait(500);
  }
  log('1. Ses bağlantısı:', JSON.stringify(conns1));
  if (!conns1.length || !conns1.every((c) => c === 'connected')) { log('✗ Ses bağlantısı kurulamadı'); process.exit(1); }

  // 2) A metin kanalına geçer → ses bağlantısı KORUNMALI (voiceChannel hâlâ dolu)
  await a.evaluate(() => { [...document.querySelectorAll('#text-channels .channel')].find((x) => x.querySelector('.ch-name').textContent.trim() === 'genel').click(); });
  await wait(800);
  const afterText = await a.evaluate(() => ({
    voiceChannel: window.__nexarc.voiceChannel,
    peers: window.__nexarc.voicePCs.size,
    conns: [...window.__nexarc.voicePCs.values()].map((m) => m.pc.connectionState),
  }));
  log('2. Metin kanalına geçince:', JSON.stringify(afterText));
  if (afterText.voiceChannel !== 'ses-genel') { log('✗ Ses kanalından çıkıldı!'); process.exit(1); }
  if (afterText.peers !== 1 || !afterText.conns.every((c) => c === 'connected')) { log('✗ Ses bağlantısı koptu!'); process.exit(1); }
  log('   ✓ Ses bağlantısı korundu (voiceChannel=ses-genel, 1 peer connected)');

  // 3) A ses kanalı butonuna TEKRAR tıklar → çıkmaz, ses görünümünü gösterir
  await a.evaluate(() => { [...document.querySelectorAll('#voice-channels .channel')].find((x) => x.querySelector('.ch-name').textContent.trim() === 'Genel Ses').click(); });
  await wait(800);
  const afterReclick = await a.evaluate(() => ({
    voiceChannel: window.__nexarc.voiceChannel,
    voiceViewVisible: !document.querySelector('#voice-view').classList.contains('hidden'),
    peers: window.__nexarc.voicePCs.size,
  }));
  log('3. Ses kanalına tekrar tıklayınca:', JSON.stringify(afterReclick));
  if (afterReclick.voiceChannel !== 'ses-genel') { log('✗ Tekrar tıklayınca çıkıldı!'); process.exit(1); }
  if (!afterReclick.voiceViewVisible) { log('✗ Ses görünümü açılmadı'); process.exit(1); }
  if (afterReclick.peers !== 1) { log('✗ Bağlantı koptu'); process.exit(1); }
  log('   ✓ Ses kanalında kaldı, görünüm açıldı, bağlantı korundu');

  // 4) Gürültü engelleme butonu var; toggle sonrası SES BAĞLANTISI SAĞLAM KALMALI
  const noiseInfo = await a.evaluate(() => ({
    btnExists: !!document.querySelector('#noise-btn'),
    micTracks: window.__nexarc.localStream ? window.__nexarc.localStream.getAudioTracks().length : 0,
  }));
  log('4. Gürültü engelleme:', JSON.stringify(noiseInfo));
  if (!noiseInfo.btnExists) { log('✗ Gürültü butonu yok'); process.exit(1); }
  if (noiseInfo.micTracks !== 1) { log('✗ Mikrofon track yok'); process.exit(1); }

  // Butona bas (toggle: filtreyi kapat) → bağlantı kopmamalı, ses track'i değişmeli
  await a.evaluate(() => document.querySelector('#noise-btn').click());
  await wait(1500);
  const afterToggle = await a.evaluate(() => ({
    conns: [...window.__nexarc.voicePCs.values()].map((m) => m.pc.connectionState),
    micTracks: window.__nexarc.localStream ? window.__nexarc.localStream.getAudioTracks().length : 0,
  }));
  log('   Toggle sonrası:', JSON.stringify(afterToggle));
  if (!afterToggle.conns.every((c) => c === 'connected')) { log('✗ Toggle ses bağlantısını kopardı!'); process.exit(1); }
  if (afterToggle.micTracks !== 1) { log('✗ Toggle sonrası mikrofon track yok'); process.exit(1); }
  log('   ✓ Gürültü toggle çalışıyor, ses bağlantısı SAĞLAM');

  // Tekrar aç
  await a.evaluate(() => document.querySelector('#noise-btn').click());
  await wait(1200);
  const afterOn = await a.evaluate(() => [...window.__nexarc.voicePCs.values()].map((m) => m.pc.connectionState));
  if (!afterOn.every((c) => c === 'connected')) { log('✗ Filtre açılınca bağlantı koptu'); process.exit(1); }
  log('   ✓ Filtre tekrar açıldı, bağlantı korundu');

  await browser.close();
  log('\nSONUÇ: v3.8 TESTLERİ GEÇTİ ✔');
  process.exit(0);
})().catch((e) => { console.error('✗ ' + e.message); process.exit(1); });

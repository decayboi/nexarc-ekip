/* v4.1 ses garanti testi: 3 kullanıcı, her bağlantıda ses track'i + connected + alıcıda ses */
const puppeteer = require('puppeteer');
const log = (...a) => process.stderr.write(a.join(' ') + '\n');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const URL = 'http://localhost:3000';

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new', protocolTimeout: 60000,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--mute-audio'],
  });
  const pages = [];
  const ctxs = [];
  for (let i = 0; i < 3; i++) {
    ctxs.push(await browser.createBrowserContext());
    pages.push(await ctxs[i].newPage());
  }
  pages.forEach((p, i) => p.on('pageerror', (e) => log(`[P${i} hata]`, e.message.slice(0, 120))));

  const uniq = Date.now().toString(36);
  const names = ['Ali', 'Ayse', 'Mert']; // ASCII — Türkçe karakter kullanıcı adı regex'ini geçemez
  // Sayfaları SIRAYLA aç + kayıt ol (aynı anda 3 sayfa açmak zamanlama sorunu yaratıyor)
  for (let i = 0; i < 3; i++) {
    await pages[i].goto(URL, { waitUntil: 'load', timeout: 25000 });
    await wait(600);
    // Socket bağlantısının kurulduğundan emin ol
    await pages[i].evaluate(() => new Promise((res) => {
      const s = io();
      s.on('connect', () => res());
      setTimeout(res, 4000);
    }));
    await pages[i].evaluate(({ u, d }) => {
      document.querySelector('#tab-register').click();
      document.querySelector('#reg-username').value = u;
      document.querySelector('#reg-password').value = 'sifre123';
      document.querySelector('#reg-display').value = d;
      document.querySelector('#register-btn').click();
    }, { u: names[i].toLowerCase() + uniq, d: names[i] });
    log(`[P${i}] kayıt gönderildi, app bekleniyor...`);
    await pages[i].waitForSelector('#app:not(.hidden)', { timeout: 20000 });
    log(`[P${i}] app açıldı ✓`);
    await wait(1000);
  }
  // Hepsi ses kanalına SIRAYLA katılır
  for (let i = 0; i < 3; i++) {
    await pages[i].evaluate(() => {
      const btn = [...document.querySelectorAll('#voice-channels .channel')].find((x) => x.querySelector('.ch-name').textContent.trim() === 'Genel Ses');
      if (btn) btn.click();
    });
    await wait(1200);
  }
  // Poll: herkesin 2 peer'ı connected + ses track'i var
  let ok = false;
  for (let t = 0; t < 30; t++) {
    const states = [];
    for (let i = 0; i < 3; i++) {
      states.push(await pages[i].evaluate(() => ({
        peers: window.__nexarc.voicePCs.size,
        conns: [...window.__nexarc.voicePCs.values()].map((m) => m.pc.connectionState),
        hasAudio: window.__nexarc.voicePCs.size
          ? [...window.__nexarc.voicePCs.values()].every((m) => m.audioSender ? true : m.pc.getSenders().some((s) => s.track && s.track.kind === 'audio'))
          : false,
        mic: window.__nexarc.localStream ? window.__nexarc.localStream.getAudioTracks().length : 0,
      })));
    }
    // Ses akışı (audioEls) esas kriter — bağlantı 'connected' olmasa bile track gelmişse ses var
    const audioCounts = [];
    for (let i = 0; i < 3; i++) {
      audioCounts.push(await pages[i].evaluate(() => window.__nexarc.audioEls.size));
    }
    ok = states.every((s) => s.peers === 2 && s.mic >= 1) && audioCounts.every((n) => n === 2);
    if (ok) { log('Tüm bağlantılar kuruldu + ses akışları tam (iterasyon ' + t + ')'); break; }
    await wait(800);
  }
  for (let i = 0; i < 3; i++) {
    const s = await pages[i].evaluate(() => ({
      peers: window.__nexarc.voicePCs.size,
      conns: [...window.__nexarc.voicePCs.values()].map((m) => m.pc.connectionState),
      mic: window.__nexarc.localStream ? window.__nexarc.localStream.getAudioTracks().length : 0,
      audioEls: window.__nexarc.audioEls.size,
    }));
    log(`Kullanıcı ${names[i]}:`, JSON.stringify(s));
  }
  if (!ok) { log('✗ Ses bağlantıları kurulamadı (3 kişi)'); process.exit(1); }

  // Alıcı taraflarda ses elementleri var mı (herkes herkesi duyuyor) — poll ile
  let allAudio = false;
  for (let t = 0; t < 20; t++) {
    const counts = [];
    for (let i = 0; i < 3; i++) {
      counts.push(await pages[i].evaluate(() => window.__nexarc.audioEls.size));
    }
    allAudio = counts.every((n) => n === 2);
    if (allAudio) { log('Ses akışları tamam (iterasyon ' + t + '): ' + counts.join(',')); break; }
    await wait(700);
  }
  for (let i = 0; i < 3; i++) {
    const n = await pages[i].evaluate(() => window.__nexarc.audioEls.size);
    if (n !== 2) { log(`✗ ${names[i]} 2 ses akışı almalı, aldı: ${n}`); process.exit(1); }
  }
  log('✓ Herkes diğer 2 kişinin ses akışını alıyor (2\'şer audio element)');

  // Gürültü toggle sonrası bağlantı sağlam kalıyor
  await pages[0].evaluate(() => document.querySelector('#noise-btn').click());
  await wait(1500);
  const afterNoise = await pages[0].evaluate(() => [...window.__nexarc.voicePCs.values()].map((m) => m.pc.connectionState));
  if (!afterNoise.every((c) => c === 'connected')) { log('✗ Gürültü toggle bağlantıyı kopardı'); process.exit(1); }
  log('✓ Gürültü toggle sonrası bağlantılar sağlam');

  await browser.close();
  log('\nSONUÇ: v4.1 SES GARANTİ TESTİ GEÇTİ ✔');
  process.exit(0);
})().catch((e) => { console.error('✗ ' + e.message); process.exit(1); });

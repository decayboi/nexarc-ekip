/* Süper test: tüm testleri 5'er kez koşar. Sunucunun açık olduğunu varsayar.
   Her tur öncesi accounts.json temizlenir ve sunucu yeniden başlatılır (admin testleri için). */
const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const APP = '/home/user/nexarc-app';
const E2E = path.join(APP, 'test/e2e');
const TESTS = [
  'v39-check.js',         // ptt/kick/ayraç — accounts BOŞKEN koşmalı (admin)
  'browser-test.js',      // masaüstü
  'mobile-test.js',       // mobil
  'media-test.js',        // medya
  'auth-test.js',         // hesap
  'channels-test.js',     // kanallar
  'features-test.js',     // özellikler
  'dm-avatar-test.js',    // DM + fotoğraf
  'dm-view-test.js',      // DM görünüm
  'v32-check.js',         // kamera/send/vol
  'v34-check.js',         // kamera kartı
  'v36-check.js',         // hover panel
  'v37-check.js',         // mention/markdown
  'v38-check.js',         // ses geçişi
];
const ROUNDS = 5;

function run(cmd, opts = {}) {
  return execSync(cmd, { cwd: opts.cwd || APP, stdio: ['ignore', 'pipe', 'pipe'], timeout: opts.timeout || 60000, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opts });
}
function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function restartServer() {
  // accounts temizle + sunucu restart (admin ilk kayıtta olsun)
  try { fs.unlinkSync(path.join(APP, 'accounts.json')); } catch (e) {}
  // mevcut node server.js süreçlerini öldür
  try { execSync("pkill -f 'node server.js' || true", { timeout: 10000 }); } catch (e) {}
  await wait(800);
  const child = spawn('npm', ['start'], { cwd: APP, detached: true, stdio: 'ignore' });
  child.unref();
  await wait(2500);
  return child;
}

(async () => {
  const results = {};
  for (const t of TESTS) results[t] = { pass: 0, fail: 0, errors: [] };

  for (let round = 1; round <= ROUNDS; round++) {
    console.log(`\n========== TUR ${round}/${ROUNDS} ==========`);
    await restartServer();
    for (const t of TESTS) {
      const label = t.replace('.js', '');
      try {
        const out = run(`node ${t} 2>&1`, { cwd: E2E, timeout: 320000 });
        if (out.includes('GEÇTİ') || out.includes('TAMAMEN GEÇTİ')) {
          results[t].pass++;
          console.log(`  [TUR ${round}] ✓ ${label}`);
        } else {
          results[t].fail++;
          results[t].errors.push(`round${round}: sonuç bulunamadı`);
          console.log(`  [TUR ${round}] ? ${label} (sonuç yok)`);
        }
      } catch (e) {
        results[t].fail++;
        const msg = String(e.stdout || e.message || '').split('\n').filter(Boolean).slice(-2).join(' | ');
        results[t].errors.push(`round${round}: ${msg.slice(0, 160)}`);
        console.log(`  [TUR ${round}] ✗ ${label}: ${msg.slice(0, 120)}`);
      }
    }
  }

  console.log('\n========== SONUÇLAR (5 TUR) ==========');
  let allOk = true;
  for (const t of TESTS) {
    const r = results[t];
    const ok = r.fail === 0;
    if (!ok) allOk = false;
    console.log(`${ok ? '✓' : '✗'} ${t}: ${r.pass}/5 geçti${r.errors.length ? ' → ' + r.errors[0] : ''}`);
  }
  console.log(allOk ? '\nTÜM TESTLER 5/5 GEÇTİ ✔' : '\nBAZILARI BAŞARISIZ ✗');
  process.exit(allOk ? 0 : 1);
})();

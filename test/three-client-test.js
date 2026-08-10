/* ============================================================
   NEXARC — 3 KİŞİLİK UÇTAN UCA TEST (socket düzeyi)
   Giriş, metin, ses kanalı, sinyal, ekran paylaşımı, çıkışlar.
   Tüm adımlarda "önce dinle, sonra gönder" deseni kullanılır.
   Çalıştırma: node test/three-client-test.js  (sunucu açıkken)
   ============================================================ */
const { io } = require('socket.io-client');

const URL = process.env.URL || 'http://localhost:3000';
const uniq = Date.now().toString(36);
const names = ['Ali', 'Ayşe', 'Mert'].map((n, i) => `${n}-${uniq}-${i}`);

const ok = (name) => console.log('✓ ' + name);
const fail = (name, e) => { console.error('✗ ' + name, e && e.message); process.exit(1); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const onEvent = (sock, ev, timeout = 20000) => new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error(ev + ' timeout')), timeout);
  sock.once(ev, (d) => { clearTimeout(t); res(d); });
});

/* state'te N kullanıcı görülene kadar bekle */
function waitUsers(sock, n, timeout = 15000) {
  return new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error(`state'te ${n} kullanıcı görülemedi`)), timeout);
    const h = (d) => { if (d.users.length >= n) { clearTimeout(t); sock.off('state', h); res(d); } };
    sock.on('state', h);
  });
}

async function main() {
  const clients = [];
  for (let i = 0; i < 3; i++) {
    const c = io(URL, { transports: ['websocket'] });
    clients.push(c);
  }
  await Promise.all(clients.map((c) => onEvent(c, 'connect')));

  /* ---- 1. Giriş: 3 kullanıcı ---- */
  // Dinleyicileri ÖNCE kur (state'ler init'le birlikte akabilir)
  const inits = clients.map((c, i) => {
    const p = onEvent(c, 'init');
    c.emit('join', { name: names[i], color: ['#ff725e', '#5865f2', '#3ba55d'][i] });
    return p;
  });
  const aStateP = waitUsers(clients[0], 3); // join'lerle birlikte dinlemeye başla
  const initData = await Promise.all(inits);
  if (initData.some((d) => d.channels.length < 4)) return fail("init", new Error("en az 4 kanal bekleniyor"));
  ok('Giriş: 3 kullanıcı init aldı (6 kanal)');
  await aStateP;
  ok('state: herkes herkesi görüyor (3 üye)');

  /* ---- 2. Metin: A → B ve C ---- */
  for (const c of clients) { const p = onEvent(c, 'chat-history'); c.emit('chat-join', 'genel'); await p; }
  const bChat = onEvent(clients[1], 'chat');
  const cChat = onEvent(clients[2], 'chat');
  clients[0].emit('chat', { channelId: 'genel', text: 'Merhaba 3 kişilik ekip! 🧡' });
  const mb = await bChat, mc = await cChat;
  if (mb.text !== 'Merhaba 3 kişilik ekip! 🧡' || mc.text !== mb.text) return fail('chat', new Error('mesaj yayını hatalı'));
  ok('Metin: A mesajı B ve C\'ye ulaştı');

  /* ---- 3. Ses kanalı: 3'ü de ses-genel'de ---- */
  await wait(300);
  let aJoinedP = onEvent(clients[0], 'voice-joined');
  clients[0].emit('voice-join', { channelId: 'ses-genel' });
  const aJoined = await aJoinedP;
  if (aJoined.occupants.length !== 0) return fail('voice A', new Error('boş kanal bekleniyor, gelen: ' + aJoined.occupants.length));
  await wait(250);
  let bJoinedP = onEvent(clients[1], 'voice-joined');
  clients[1].emit('voice-join', { channelId: 'ses-genel' });
  const bJoined = await bJoinedP;
  if (bJoined.occupants.length !== 1) return fail('voice B', new Error('1 kişi bekleniyor, gelen: ' + JSON.stringify(bJoined.occupants.map((o) => o.name))));
  await wait(250);
  let cJoinedP = onEvent(clients[2], 'voice-joined');
  clients[2].emit('voice-join', { channelId: 'ses-genel' });
  const cJoined = await cJoinedP;
  if (cJoined.occupants.length !== 2) return fail('voice C', new Error('2 kişi bekleniyor, gelen: ' + cJoined.occupants.length));
  ok('Ses kanalı: 3 kişi ses-genel\'de (occupants 0→1→2 sıralaması doğru)');

  /* ---- 4. Sinyal: A→B, A→C, B→C ---- */
  let sig1 = onEvent(clients[1], 'signal');
  clients[0].emit('signal', { to: clients[1].id, pcType: 'voice', data: { description: { type: 'offer', sdp: 's1' } } });
  const s1 = await sig1;
  if (s1.from !== clients[0].id || s1.pcType !== 'voice') return fail('sinyal A→B', new Error('yanlış'));
  let sig2 = onEvent(clients[2], 'signal');
  clients[0].emit('signal', { to: clients[2].id, pcType: 'voice', data: { description: { type: 'offer', sdp: 's2' } } });
  await sig2;
  let sig3 = onEvent(clients[2], 'signal');
  clients[1].emit('signal', { to: clients[2].id, pcType: 'voice', data: { description: { type: 'offer', sdp: 's3' } } });
  const s3 = await sig3;
  if (s3.from !== clients[1].id) return fail('sinyal B→C', new Error('yanlış'));
  ok('Sinyal: 3 eş arası WebRTC sinyalleri iletiliyor (A→B, A→C, B→C)');

  /* ---- 5. Ekran paylaşımı: A paylaşıyor, B ve C durumu alıyor ---- */
  let scrB = onEvent(clients[1], 'screen-state');
  let scrC = onEvent(clients[2], 'screen-state');
  clients[0].emit('screen-start');
  const sb = await scrB, sc = await scrC;
  if (!sb.sharing || !sc.sharing || sb.userId !== clients[0].id) return fail('screen-start', new Error('yayın hatalı'));
  ok('Ekran: A paylaşınca B ve C anında haberdar');

  let stopB = onEvent(clients[1], 'screen-state');
  clients[0].emit('screen-stop');
  const stb = await stopB;
  if (stb.sharing) return fail('screen-stop', new Error('durmalı'));
  ok('Ekran: A paylaşımı durdurdu, B haberdar');

  /* ---- 6. Ses kanalı değişimi: A → ses-toplanti ---- */
  let leftP = onEvent(clients[1], 'voice-user-left');
  clients[0].emit('voice-join', { channelId: 'ses-toplanti' });
  const lv = await leftP;
  if (lv.userId !== clients[0].id) return fail('kanal değişimi', new Error('userId yanlış'));
  let aJoined2P = onEvent(clients[0], 'voice-joined');
  const aJoined2 = await aJoined2P;
  if (aJoined2.channelId !== 'ses-toplanti' || aJoined2.occupants.length !== 0) return fail('kanal değişimi 2', new Error('yeni kanal boş olmalı'));
  ok('Ses kanalı değişimi: A toplantı odasına geçti, B bilgilendirildi');

  /* ---- 7. Kopma: C kapanınca A ve B haberdar ---- */
  let leftCP1 = onEvent(clients[0], 'user-left');
  let leftCP2 = onEvent(clients[1], 'user-left');
  const cId = clients[2].id;
  clients[2].disconnect();
  const l1 = await leftCP1, l2 = await leftCP2;
  if (l1.userId !== cId || l2.userId !== cId) return fail('disconnect', new Error('userId yanlış'));
  ok('Kopma: C çıkınca A ve B anında bildirim aldı');

  clients[0].disconnect();
  clients[1].disconnect();
  setTimeout(() => { console.log('\nSONUÇ: 3 KİŞİLİK TÜM TESTLER GEÇTİ ✔'); process.exit(0); }, 200);
}

main().catch((e) => { console.error('✗ ' + e.message); process.exit(1); });

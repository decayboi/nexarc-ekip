/* Nexarc sunucu duman testi — 2 istemci simüle eder (kararlı sıralama: önce dinle, sonra gönder) */
const { io } = require('/tmp/nexarc-test/node_modules/socket.io-client');

const URL = 'http://localhost:3000';
const uniq = Date.now().toString(36);
const nA = 'Ali-' + uniq, nB = 'Ayse-' + uniq;

const ok = (name) => console.log('✓ ' + name);
const fail = (name, e) => { console.error('✗ ' + name, e && e.message); process.exit(1); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const onEvent = (sock, ev, timeout = 4000) => new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error(ev + ' timeout')), timeout);
  sock.once(ev, (d) => { clearTimeout(t); res(d); });
});

async function main() {
  const a = io(URL, { transports: ['websocket'] });
  const b = io(URL, { transports: ['websocket'] });

  await Promise.all([onEvent(a, 'connect'), onEvent(b, 'connect')]);

  // Giriş (önce dinleyiciler)
  const aInitP = onEvent(a, 'init');
  const bInitP = onEvent(b, 'init');
  // A, 2 kullanıcıyı görene kadar state'leri topla (önce 1 kullanıcılı, sonra 2 kullanıcılı gelir)
  const aStateP = new Promise((resolve) => {
    const h = (d) => { if (d.users.length >= 2) { a.off('state', h); resolve(d); } };
    a.on('state', h);
  });
  a.emit('join', { name: nA, color: '#ff725e' });
  b.emit('join', { name: nB, color: '#5865f2' });
  const aInit = await aInitP;
  const bInit = await bInitP;
  const aState = await aStateP;
  ok('Giriş: 2 kullanıcı init aldı, kanallar: ' + aInit.channels.length);
  ok('state: A, B\'yi gördü');

  // Metin sohbeti
  const histAP = onEvent(a, 'chat-history');
  a.emit('chat-join', 'genel');
  await histAP;
  const histBP = onEvent(b, 'chat-history');
  b.emit('chat-join', 'genel');
  await histBP;
  const chatP = onEvent(b, 'chat');
  a.emit('chat', { channelId: 'genel', text: 'Merhaba ekip! 🧡' });
  const msg = await chatP;
  if (msg.text !== 'Merhaba ekip! 🧡') return fail('chat', new Error('mesaj içeriği hatalı'));
  ok('Metin kanalı: B, A\'nın mesajını aldı');

  // Ses kanalı — A katılıyor
  const joinedAP = onEvent(a, 'voice-joined');
  a.emit('voice-join', { channelId: 'ses-genel' });
  const joinedA = await joinedAP;
  if (joinedA.occupants.length !== 0) return fail('voice-join A', new Error('boş kanal bekleniyor'));
  ok('Ses kanalı: A katıldı (boş kanal, occupants=0)');

  // Ses kanalı — B katılıyor
  const aSeesBP = onEvent(a, 'voice-user-joined');   // A, B'nin katıldığını duymalı
  const joinedBP = onEvent(b, 'voice-joined');       // B, occupants listesi almalı
  b.emit('voice-join', { channelId: 'ses-genel' });
  const jb = await aSeesBP;
  if (jb.user.name !== nB) return fail('voice-join B', new Error('B bekleniyor, gelen: ' + jb.user.name));
  const joinedB = await joinedBP;
  if (joinedB.occupants.length !== 1 || joinedB.occupants[0].name !== nA) return fail('occupants', new Error('A listede olmalı'));
  ok('Ses kanalı: 2 kişi aynı kanalda, occupants doğru');

  // Sinyal aktarımı
  const sigP = onEvent(b, 'signal');
  a.emit('signal', { to: b.id, pcType: 'voice', data: { description: { type: 'offer', sdp: 'test-sdp' } } });
  const sig = await sigP;
  if (sig.from !== a.id || sig.pcType !== 'voice' || sig.data.description.sdp !== 'test-sdp') return fail('sinyal', new Error('yanlış sinyal'));
  ok('Sinyal: A→B teklifi iletildi');

  // Ekran paylaşımı
  const scrP = onEvent(b, 'screen-state');
  a.emit('screen-start');
  const ss = await scrP;
  if (!ss.sharing || ss.userId !== a.id) return fail('screen-start', new Error('paylaşım durumu hatalı'));
  const ssoP = onEvent(b, 'screen-state');
  a.emit('screen-stop');
  const sso = await ssoP;
  if (sso.sharing) return fail('screen-stop', new Error('durmalı'));
  ok('Ekran paylaşımı: başlat/durdur durumları iletildi');

  // Kanal değişimi ve çıkış
  const leftP = onEvent(b, 'voice-user-left');
  a.emit('voice-leave');
  const lv = await leftP;
  if (lv.userId !== a.id) return fail('voice-leave', new Error('userId yanlış'));
  ok('Ses kanalından çıkış bildirildi');

  // Bağlantı kopması
  const userLeftP = onEvent(b, 'user-left');
  const aId = a.id; // disconnect olunca client'ta id undefined olur; önceden sakla
  a.disconnect();
  const ul = await userLeftP;
  if (ul.userId !== aId) return fail('disconnect', new Error('userId yanlış, beklenen: ' + aId + ', gelen: ' + ul.userId));
  ok('Bağlantı kopunca diğer kullanıcıya bildirildi');

  b.disconnect();
  a.disconnect();
  setTimeout(() => { console.log('\nSONUÇ: TÜM TESTLER GEÇTİ ✔'); process.exit(0); }, 200);
}

main().catch((e) => { console.error('✗ ' + e.message); process.exit(1); });

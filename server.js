/* ============================================================
   NEXARC EKİP — Sunucu
   3 kişilik ekip sunucusu: ses kanalları, ekran paylaşımı,
   metin kanalları. WebRTC sinyallerini Socket.IO üzerinden
   aktarır; ses/görüntü doğrudan istemciler arasında akar (mesh).
   ============================================================ */
const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 3000;

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, 'public')));

/* ------------------------------------------------------------
   KANAL YAPILANDIRMASI
   İstediğiniz kanalları buraya ekleyin/çıkarın. tür: 'text' | 'voice'
   ------------------------------------------------------------ */
const CHANNELS = [
  { id: 'genel',        name: 'genel',          type: 'text' },
  { id: 'tasarim-akisi', name: 'tasarim-akisi', type: 'text' },
  { id: 'duyurular',    name: 'duyurular',      type: 'text' },
  { id: 'ses-genel',    name: 'Genel Ses',      type: 'voice' },
  { id: 'ses-toplanti', name: 'Toplantı',       type: 'voice' },
  { id: 'ses-calisma',  name: 'Çalışma Odası',  type: 'voice' },
];

const users = new Map();        // socketId -> { id, name, color, voiceChannel, sharing }
const chatHistory = new Map();  // channelId -> [message]
const MAX_HISTORY = 100;

const sanitize = (u) => ({ id: u.id, name: u.name, color: u.color, voiceChannel: u.voiceChannel, sharing: u.sharing });
const statePayload = () => ({ users: [...users.values()].map(sanitize) });

function pushChat(channelId, msg) {
  const arr = chatHistory.get(channelId) || [];
  arr.push(msg);
  if (arr.length > MAX_HISTORY) arr.shift();
  chatHistory.set(channelId, arr);
}

io.on('connection', (socket) => {
  console.log(`[+] bağlandı: ${socket.id} (${io.engine.clientsCount} kişi)`);

  /* ---- Giriş ---- */
  socket.on('join', ({ name, color }) => {
    const cleanName = String(name || '').trim().slice(0, 24) || 'Misafir';
    const user = {
      id: socket.id,
      name: cleanName,
      color: String(color || '#ff725e').slice(0, 7),
      voiceChannel: null,
      sharing: false,
    };
    users.set(socket.id, user);
    socket.emit('init', { self: sanitize(user), channels: CHANNELS });
    io.emit('state', statePayload()); // herkes güncel üye listesini alsın
    io.emit('user-joined', { user: sanitize(user) });
  });

  /* ---- Metin kanalları ---- */
  socket.on('chat-join', (channelId) => {
    const ch = CHANNELS.find((c) => c.id === channelId && c.type === 'text');
    if (!ch) return;
    socket.join('ch:' + channelId);
    socket.emit('chat-history', { channelId, messages: chatHistory.get(channelId) || [] });
  });

  socket.on('chat', ({ channelId, text }) => {
    const user = users.get(socket.id);
    const ch = CHANNELS.find((c) => c.id === channelId && c.type === 'text');
    if (!user || !ch) return;
    const msgText = String(text || '').slice(0, 2000);
    if (!msgText.trim()) return;
    const msg = {
      id: socket.id + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
      channelId,
      user: sanitize(user),
      text: msgText,
      ts: Date.now(),
    };
    pushChat(channelId, msg);
    io.to('ch:' + channelId).emit('chat', msg);
  });

  /* ---- Ses kanalları ---- */
  socket.on('voice-join', ({ channelId }) => {
    const user = users.get(socket.id);
    const ch = CHANNELS.find((c) => c.id === channelId && c.type === 'voice');
    if (!user || !ch) return;
    if (user.voiceChannel === channelId) return;
    // Eski kanaldan çık
    if (user.voiceChannel) {
      socket.to('ch:' + user.voiceChannel).emit('voice-user-left', { userId: socket.id });
      socket.leave('ch:' + user.voiceChannel);
    }
    user.voiceChannel = channelId;
    user.sharing = false;
    socket.join('ch:' + channelId);

    const occupants = [...users.values()]
      .filter((u) => u.id !== socket.id && u.voiceChannel === channelId)
      .map(sanitize);

    socket.emit('voice-joined', { channelId, occupants });
    socket.to('ch:' + channelId).emit('voice-user-joined', { user: sanitize(user) });
    io.emit('state', statePayload());
  });

  socket.on('voice-leave', () => {
    const user = users.get(socket.id);
    if (!user || !user.voiceChannel) return;
    const ch = user.voiceChannel;
    user.voiceChannel = null;
    user.sharing = false;
    socket.leave('ch:' + ch);
    socket.to('ch:' + ch).emit('voice-user-left', { userId: socket.id });
    io.emit('state', statePayload());
  });

  /* ---- Ekran paylaşımı durumu ---- */
  socket.on('screen-start', () => {
    const user = users.get(socket.id);
    if (!user || !user.voiceChannel || user.sharing) return;
    user.sharing = true;
    socket.to('ch:' + user.voiceChannel).emit('screen-state', { userId: socket.id, sharing: true });
    io.emit('state', statePayload());
  });

  socket.on('screen-stop', () => {
    const user = users.get(socket.id);
    if (!user || !user.sharing) return;
    user.sharing = false;
    if (user.voiceChannel) {
      socket.to('ch:' + user.voiceChannel).emit('screen-state', { userId: socket.id, sharing: false });
    }
    io.emit('state', statePayload());
  });

  /* ---- WebRTC sinyal aktarımı (ses + ekran) ---- */
  socket.on('signal', ({ to, pcType, data }) => {
    const target = io.sockets.sockets.get(to);
    if (target) target.emit('signal', { from: socket.id, pcType, data });
  });

  socket.on('disconnect', () => {
    const user = users.get(socket.id);
    if (user) {
      if (user.voiceChannel) {
        socket.to('ch:' + user.voiceChannel).emit('voice-user-left', { userId: socket.id });
      }
      users.delete(socket.id);
    }
    io.emit('user-left', { userId: socket.id });
    io.emit('state', statePayload());
    console.log(`[-] koptu: ${socket.id} (${io.engine.clientsCount} kişi)`);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Nexarc Ekip sunucusu çalışıyor → http://0.0.0.0:${PORT}`);
});

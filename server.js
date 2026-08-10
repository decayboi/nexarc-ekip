/* ============================================================
   NEXARC EKİP — Sunucu v2.9
   Ses/ekran/kamera WebRTC sinyali, metin kanalları, DM,
   mesaj düzenleme/tepki/pin, roller, durumlar, kanal yönetimi
   ============================================================ */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');

const PORT = process.env.PORT || 3000;
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
app.use(express.static(path.join(__dirname, 'public')));

/* ---- Medya yükleme ---- */
const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const ALLOWED_MIMES = new Set(['application/pdf', 'text/plain', 'application/zip', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']);
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
      const ext = path.extname(String(file.originalname || '')).slice(0, 12);
      cb(null, Date.now() + '-' + Math.random().toString(36).slice(2, 8) + ext);
    },
  }),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const t = String(file.mimetype || '');
    cb(null, t.startsWith('image/') || t.startsWith('video/') || t.startsWith('audio/') || ALLOWED_MIMES.has(t));
  },
});
app.post('/upload', (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: String(err.message || 'yükleme hatası') });
    if (!req.file) return res.status(400).json({ error: 'dosya bulunamadı' });
    res.json({ url: '/uploads/' + req.file.filename, name: String(req.file.originalname || 'dosya').slice(0, 200), size: req.file.size, type: String(req.file.mimetype || '') });
  });
});

/* ---- Kanallar ---- */
const CHANNELS = [
  { id: 'genel', name: 'genel', type: 'text' },
  { id: 'tasarim-akisi', name: 'tasarim-akisi', type: 'text' },
  { id: 'duyurular', name: 'duyurular', type: 'text' },
  { id: 'ses-genel', name: 'Genel Ses', type: 'voice' },
  { id: 'ses-toplanti', name: 'Toplantı', type: 'voice' },
  { id: 'ses-calisma', name: 'Çalışma Odası', type: 'voice' },
];

const users = new Map();          // socketId -> user
const chatHistory = new Map();    // channelId/roomId -> [message]
const dmRooms = new Map();        // roomId -> { a, b } (usernames)
const MAX_HISTORY = 100;

/* ---- Hesaplar / oturumlar ---- */
const ACCOUNTS_FILE = path.join(__dirname, 'accounts.json');
let accounts = {};
const sessions = new Map();
const socketAccounts = new Map();

function loadAccounts() {
  try { if (fs.existsSync(ACCOUNTS_FILE)) accounts = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf8')) || {}; }
  catch (e) { console.error('hesaplar okunamadı:', e.message); }
}
function saveAccounts() {
  try { fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2)); }
  catch (e) { console.error('hesaplar kaydedilemedi:', e.message); }
}
loadAccounts();
function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  return salt + ':' + crypto.scryptSync(String(pw), salt, 64).toString('hex');
}
function verifyPassword(pw, stored) {
  try {
    const [salt, hash] = String(stored).split(':');
    const test = crypto.scryptSync(String(pw), salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(test, 'hex'));
  } catch (e) { return false; }
}
function makeToken() { return crypto.randomBytes(24).toString('hex'); }
function sanitizeAccount(username) {
  const a = accounts[username];
  return { username, displayName: a.displayName, color: a.color, avatar: a.avatar || '', role: a.role || 'member', status: a.status || 'online' };
}

const sanitize = (u) => ({
  id: u.id, name: u.name, color: u.color, avatar: u.avatar || '', username: u.username || null,
  role: u.role || 'member', status: u.status || 'online', statusText: u.statusText || '',
  voiceChannel: u.voiceChannel, sharing: !!u.sharing, camera: !!u.camera, muted: !!u.muted,
});
const statePayload = () => ({ users: [...users.values()].map(sanitize) });

function getChannelsFor(user) {
  const list = CHANNELS.slice();
  for (const [roomId, dm] of dmRooms) {
    if (user.username && (dm.a === user.username || dm.b === user.username)) {
      // Görünen ad (displayName) kullan — Discord arkadaş listesi gibi
      const other = dm.a === user.username ? dm.b : dm.a;
      const otherAcc = accounts[other];
      list.push({ id: roomId, name: '@' + (otherAcc ? otherAcc.displayName : other), type: 'text', dm: true });
    }
  }
  return list;
}
function isChatAllowed(channelId, user) {
  const ch = CHANNELS.find((c) => c.id === channelId && c.type === 'text');
  if (ch) return true;
  if (user.username) {
    const dm = dmRooms.get(channelId);
    if (dm && (dm.a === user.username || dm.b === user.username)) return true;
  }
  return false;
}

io.on('connection', (socket) => {
  console.log(`[+] bağlandı: ${socket.id} (${io.engine.clientsCount} kişi)`);

  /* ---- Kayıt / giriş / otomatik giriş ---- */
  socket.on('register', ({ username, password, displayName, color, avatar }, cb) => {
    const u = String(username || '').trim().toLowerCase();
    if (!/^[a-z0-9_]{3,20}$/.test(u)) return cb && cb({ ok: false, error: 'Kullanıcı adı 3-20 karakter olmalı (harf, rakam, _)' });
    if (String(password || '').length < 4) return cb && cb({ ok: false, error: 'Şifre en az 4 karakter olmalı' });
    const disp = String(displayName || '').trim();
    if (!disp || disp.length > 24) return cb && cb({ ok: false, error: 'Görünen ad 1-24 karakter olmalı' });
    if (accounts[u]) return cb && cb({ ok: false, error: 'Bu kullanıcı adı zaten alınmış' });
    const isFirst = Object.keys(accounts).length === 0;
    accounts[u] = {
      passwordHash: hashPassword(password),
      displayName: disp.slice(0, 24),
      color: String(color || '#ff725e').slice(0, 7),
      avatar: String(avatar || '').slice(0, 8),
      role: isFirst ? 'admin' : 'member',
      status: 'online',
      createdAt: Date.now(),
    };
    saveAccounts();
    const token = makeToken();
    sessions.set(token, u);
    cb && cb({ ok: true, token, user: sanitizeAccount(u) });
  });

  socket.on('login', ({ username, password }, cb) => {
    const u = String(username || '').trim().toLowerCase();
    const a = accounts[u];
    if (!a || !verifyPassword(password, a.passwordHash)) return cb && cb({ ok: false, error: 'Kullanıcı adı veya şifre hatalı' });
    const token = makeToken();
    sessions.set(token, u);
    cb && cb({ ok: true, token, user: sanitizeAccount(u) });
  });

  socket.on('auto-login', ({ token }, cb) => {
    const u = sessions.get(String(token || ''));
    if (!u || !accounts[u]) return cb && cb({ ok: false });
    cb && cb({ ok: true, user: sanitizeAccount(u) });
  });

  /* ---- Giriş (hesap veya misafir) ---- */
  socket.on('join', ({ token, name, color, avatar }) => {
    let account = null;
    if (token) {
      const u = sessions.get(String(token || ''));
      if (u && accounts[u]) account = sanitizeAccount(u);
    }
    const user = {
      id: socket.id,
      username: account ? account.username : null,
      name: account ? account.displayName : (String(name || '').trim().slice(0, 24) || 'Misafir'),
      color: account ? account.color : String(color || '#ff725e').slice(0, 7),
      avatar: account ? account.avatar : String(avatar || '').slice(0, 200),
      role: account ? account.role : 'member',
      status: account ? account.status : 'online',
      statusText: account ? (account.statusText || '') : '',
      voiceChannel: null, sharing: false, camera: false, muted: false,
    };
    users.set(socket.id, user);
    if (account) socketAccounts.set(socket.id, account.username);
    socket.emit('init', { self: sanitize(user), channels: getChannelsFor(user) });
    io.emit('state', statePayload());
    io.emit('user-joined', { user: sanitize(user) });
  });

  /* ---- Profil / durum ---- */
  socket.on('update-profile', ({ displayName, color, avatar, status, statusText }, cb) => {
    const user = users.get(socket.id);
    if (!user) return cb && cb({ ok: false, error: 'Oturum yok' });
    const disp = String(displayName || '').trim();
    if (!disp || disp.length > 24) return cb && cb({ ok: false, error: 'Görünen ad 1-24 karakter olmalı' });
    user.name = disp.slice(0, 24);
    user.color = String(color || '#ff725e').slice(0, 7);
    // Avatar: emoji (kısa) veya yüklenmiş fotoğraf URL'si
    const av = String(avatar || '').slice(0, 200);
    user.avatar = (av.startsWith('/uploads/') || av.length <= 8) ? av : '';
    if (['online', 'idle', 'dnd'].includes(status)) user.status = status;
    user.statusText = String(statusText || '').trim().slice(0, 60);
    const accName = socketAccounts.get(socket.id);
    if (accName && accounts[accName]) {
      accounts[accName].displayName = user.name;
      accounts[accName].color = user.color;
      accounts[accName].avatar = user.avatar;
      accounts[accName].status = user.status;
      accounts[accName].statusText = user.statusText;
      saveAccounts();
    }
    io.emit('state', statePayload());
    cb && cb({ ok: true, user: sanitize(user) });
  });

  socket.on('status-update', ({ status }, cb) => {
    const user = users.get(socket.id);
    if (!user) return cb && cb({ ok: false });
    if (['online', 'idle', 'dnd'].includes(status)) {
      user.status = status;
      const accName = socketAccounts.get(socket.id);
      if (accName && accounts[accName]) { accounts[accName].status = status; saveAccounts(); }
      io.emit('state', statePayload());
    }
    cb && cb({ ok: true });
  });

  /* ---- Metin kanalları / DM ---- */
  socket.on('chat-join', (channelId) => {
    const user = users.get(socket.id);
    if (!user || !isChatAllowed(channelId, user)) return;
    socket.join('ch:' + channelId);
    socket.emit('chat-history', { channelId, messages: chatHistory.get(channelId) || [] });
    const pins = (chatHistory.get(channelId) || []).filter((m) => m.pinned);
    socket.emit('pin-list', { channelId, pins });
  });

  socket.on('dm-open', ({ username }, cb) => {
    const user = users.get(socket.id);
    const target = String(username || '').trim().toLowerCase();
    if (!user || !user.username) return cb && cb({ ok: false, error: 'DM için hesap gerekli' });
    if (!accounts[target]) return cb && cb({ ok: false, error: 'Kullanıcı bulunamadı' });
    const roomId = 'dm:' + [user.username, target].sort().join(':');
    if (!dmRooms.has(roomId)) dmRooms.set(roomId, { a: user.username, b: target });
    if (!chatHistory.has(roomId)) chatHistory.set(roomId, []);
    socket.join('ch:' + roomId);
    const peer = accounts[target];
    cb && cb({ ok: true, roomId, peer: { name: peer.displayName, username: target, color: peer.color, avatar: peer.avatar || '', role: peer.role } });
    // Yalnızca DM'deki iki kişinin kanal listesi güncellensin (herkese değil!)
    for (const [sid, u] of users) {
      if (u.username === user.username || u.username === target) {
        io.to(sid).emit('channels-updated', { channels: getChannelsFor(u) });
      }
    }
  });

  socket.on('chat', ({ channelId, text, media, replyTo }) => {
    const user = users.get(socket.id);
    if (!user || !isChatAllowed(channelId, user)) return;
    const msgText = String(text || '').slice(0, 2000);
    let msgMedia = null;
    if (media && typeof media.url === 'string' && media.url.startsWith('/uploads/')) {
      msgMedia = { url: media.url.slice(0, 300), name: String(media.name || 'dosya').slice(0, 200), size: Number(media.size) || 0, type: String(media.type || '').slice(0, 100) };
    }
    if (!msgText.trim() && !msgMedia) return;
    let reply = null;
    if (replyTo && typeof replyTo.id === 'string') {
      const orig = (chatHistory.get(channelId) || []).find((m) => m.id === replyTo.id);
      if (orig) reply = { id: orig.id, name: orig.user.name, text: String(orig.text || '').slice(0, 140) };
    }
    const msg = {
      id: socket.id + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
      channelId, user: sanitize(user), text: msgText, media: msgMedia, replyTo: reply,
      reactions: {}, pinned: false, edited: false, ts: Date.now(),
    };
    pushChat(channelId, msg);
    io.to('ch:' + channelId).emit('chat', msg);

    /* @bahsetme: hedeflenen kullanıcı çevrimiçiyse bildirim gönder */
    const mentions = new Set();
    for (const m of msgText.matchAll(/@([a-zA-Z0-9_ğüşiöçĞÜŞİÖÇ]+)/g)) {
      const uname = m[1].toLowerCase();
      if (accounts[uname] && uname !== (user.username || '')) mentions.add(uname);
    }
    if (mentions.size) {
      for (const [sid, u] of users) {
        if (u.username && mentions.has(u.username)) {
          io.to(sid).emit('mention', { channelId, from: user.name, text: msgText.slice(0, 120), channelName: (CHANNELS.find((c) => c.id === channelId) || {}).name || 'DM' });
        }
      }
    }
  });

  socket.on('delete-message', ({ channelId, messageId }, cb) => {
    const user = users.get(socket.id);
    const arr = chatHistory.get(String(channelId || ''));
    if (!user || !arr) return cb && cb({ ok: false, error: 'Silinemez' });
    const idx = arr.findIndex((m) => m.id === messageId);
    if (idx === -1) return cb && cb({ ok: false, error: 'Mesaj bulunamadı' });
    if (arr[idx].user.id !== socket.id) return cb && cb({ ok: false, error: 'Sadece kendi mesajını silebilirsin' });
    arr.splice(idx, 1);
    io.to('ch:' + channelId).emit('message-deleted', { channelId, messageId });
    cb && cb({ ok: true });
  });

  socket.on('message-update', ({ channelId, messageId, text }, cb) => {
    const user = users.get(socket.id);
    const arr = chatHistory.get(String(channelId || ''));
    if (!user || !arr) return cb && cb({ ok: false, error: 'Bulunamadı' });
    const m = arr.find((x) => x.id === messageId);
    if (!m) return cb && cb({ ok: false, error: 'Mesaj bulunamadı' });
    if (m.user.id !== socket.id) return cb && cb({ ok: false, error: 'Sadece kendi mesajını düzenleyebilirsin' });
    const t = String(text || '').trim().slice(0, 2000);
    if (!t) return cb && cb({ ok: false, error: 'Mesaj boş olamaz' });
    m.text = t; m.edited = true;
    io.to('ch:' + channelId).emit('message-updated', { channelId, messageId, text: t, edited: true });
    cb && cb({ ok: true });
  });

  socket.on('message-reaction', ({ channelId, messageId, emoji }, cb) => {
    const user = users.get(socket.id);
    const arr = chatHistory.get(String(channelId || ''));
    if (!user || !arr) return cb && cb({ ok: false });
    const m = arr.find((x) => x.id === messageId);
    if (!m) return cb && cb({ ok: false });
    const e = String(emoji || '').slice(0, 8);
    if (!e) return cb && cb({ ok: false });
    m.reactions = m.reactions || {};
    const list = m.reactions[e] || [];
    const i = list.indexOf(user.id);
    if (i >= 0) list.splice(i, 1); else list.push(user.id);
    if (!list.length) delete m.reactions[e]; else m.reactions[e] = list;
    io.to('ch:' + channelId).emit('message-reacted', { channelId, messageId, reactions: m.reactions });
    cb && cb({ ok: true });
  });

  socket.on('message-pin', ({ channelId, messageId }, cb) => {
    const user = users.get(socket.id);
    const arr = chatHistory.get(String(channelId || ''));
    if (!user || !arr) return cb && cb({ ok: false });
    const m = arr.find((x) => x.id === messageId);
    if (!m) return cb && cb({ ok: false });
    m.pinned = !m.pinned;
    io.to('ch:' + channelId).emit('message-pinned', { channelId, messageId, pinned: m.pinned });
    cb && cb({ ok: true, pinned: m.pinned });
  });

  socket.on('search', ({ channelId, query }, cb) => {
    const arr = chatHistory.get(String(channelId || '')) || [];
    const q = String(query || '').trim().toLowerCase();
    if (!q) return cb && cb({ results: [] });
    cb && cb({ results: arr.filter((m) => (m.text || '').toLowerCase().includes(q)).slice(-40).reverse() });
  });

  socket.on('typing', ({ channelId }) => {
    const user = users.get(socket.id);
    if (!user || !isChatAllowed(channelId, user)) return;
    socket.to('ch:' + channelId).emit('typing', { channelId, userId: socket.id, name: user.name });
  });

  /* ---- Kanal yönetimi (admin) ---- */
  socket.on('channel-create', ({ name, type }, cb) => {
    const user = users.get(socket.id);
    if (!user) return cb && cb({ ok: false, error: 'Oturum yok' });
    const clean = String(name || '').trim().slice(0, 30);
    if (!clean) return cb && cb({ ok: false, error: 'Kanal adı boş olamaz' });
    const t = type === 'voice' ? 'voice' : 'text';
    const base = clean.toLowerCase().replace(/[^a-z0-9çğıöşü_-]/g, '').slice(0, 20) || 'kanal';
    const id = base + '-' + Math.random().toString(36).slice(2, 6);
    CHANNELS.push({ id, name: clean, type: t });
    if (t === 'text') chatHistory.set(id, []);
    broadcastChannels();
    cb && cb({ ok: true, channel: { id, name: clean, type: t } });
  });

  socket.on('channel-delete', ({ channelId }, cb) => {
    const user = users.get(socket.id);
    if (!user) return cb && cb({ ok: false, error: 'Oturum yok' });
    const idx = CHANNELS.findIndex((c) => c.id === channelId);
    if (idx === -1) return cb && cb({ ok: false, error: 'Kanal bulunamadı' });
    CHANNELS.splice(idx, 1);
    chatHistory.delete(channelId);
    for (const u of users.values()) {
      if (u.voiceChannel === channelId) {
        u.voiceChannel = null; u.sharing = false; u.camera = false;
        const s = io.sockets.sockets.get(u.id);
        if (s) { s.leave('ch:' + channelId); s.emit('voice-kicked', { channelId }); }
      }
    }
    broadcastChannels();
    io.emit('channel-deleted', { channelId });
    cb && cb({ ok: true });
  });

  function broadcastChannels() {
    for (const u of users.values()) {
      io.to(u.id).emit('channels-updated', { channels: getChannelsFor(u) });
    }
  }

  /* ---- Kick (admin) ---- */
  socket.on('kick-user', ({ userId }, cb) => {
    const user = users.get(socket.id);
    if (!user || user.role !== 'admin') return cb && cb({ ok: false, error: 'Bu işlem için admin gerekli' });
    const target = users.get(String(userId || ''));
    if (!target) return cb && cb({ ok: false, error: 'Kullanıcı bulunamadı' });
    if (target.id === socket.id) return cb && cb({ ok: false, error: 'Kendini atamazsın' });
    const s = io.sockets.sockets.get(target.id);
    if (s) {
      s.emit('kicked', {});
      setTimeout(() => s.disconnect(true), 80);
    }
    cb && cb({ ok: true });
  });

  /* ---- Ses kanalları ---- */
  socket.on('voice-join', ({ channelId }) => {
    const user = users.get(socket.id);
    const ch = CHANNELS.find((c) => c.id === channelId && c.type === 'voice');
    if (!user || !ch) return;
    if (user.voiceChannel === channelId) return;
    if (user.voiceChannel) {
      socket.to('ch:' + user.voiceChannel).emit('voice-user-left', { userId: socket.id });
      socket.leave('ch:' + user.voiceChannel);
    }
    user.voiceChannel = channelId; user.sharing = false; user.camera = false;
    socket.join('ch:' + channelId);
    const occupants = [...users.values()].filter((u) => u.id !== socket.id && u.voiceChannel === channelId).map(sanitize);
    socket.emit('voice-joined', { channelId, occupants });
    socket.to('ch:' + channelId).emit('voice-user-joined', { user: sanitize(user) });
    io.emit('state', statePayload());
  });

  socket.on('voice-leave', () => {
    const user = users.get(socket.id);
    if (!user || !user.voiceChannel) return;
    const ch = user.voiceChannel;
    user.voiceChannel = null; user.sharing = false; user.camera = false;
    socket.leave('ch:' + ch);
    socket.to('ch:' + ch).emit('voice-user-left', { userId: socket.id });
    io.emit('state', statePayload());
  });

  socket.on('voice-mute', ({ userId, muted }, cb) => {
    const target = users.get(String(userId || ''));
    if (!target) return cb && cb({ ok: false });
    target.muted = !!muted;
    if (target.voiceChannel) {
      io.to('ch:' + target.voiceChannel).emit('voice-muted', { userId, muted: target.muted, by: socket.id });
    }
    io.emit('state', statePayload());
    cb && cb({ ok: true });
  });

  /* ---- Ekran / kamera durumu ---- */
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
    if (user.voiceChannel) socket.to('ch:' + user.voiceChannel).emit('screen-state', { userId: socket.id, sharing: false });
    io.emit('state', statePayload());
  });
  socket.on('cam-start', () => {
    const user = users.get(socket.id);
    if (!user || !user.voiceChannel || user.camera) return;
    user.camera = true;
    socket.to('ch:' + user.voiceChannel).emit('cam-state', { userId: socket.id, on: true });
    io.emit('state', statePayload());
  });
  socket.on('cam-stop', () => {
    const user = users.get(socket.id);
    if (!user || !user.camera) return;
    user.camera = false;
    if (user.voiceChannel) socket.to('ch:' + user.voiceChannel).emit('cam-state', { userId: socket.id, on: false });
    io.emit('state', statePayload());
  });

  /* ---- WebRTC sinyal aktarımı (ses/ekran/kamera) ---- */
  socket.on('signal', ({ to, pcType, data }) => {
    const target = io.sockets.sockets.get(to);
    if (target) target.emit('signal', { from: socket.id, pcType, data });
  });

  socket.on('disconnect', () => {
    const user = users.get(socket.id);
    if (user) {
      if (user.voiceChannel) socket.to('ch:' + user.voiceChannel).emit('voice-user-left', { userId: socket.id });
      users.delete(socket.id);
    }
    socketAccounts.delete(socket.id);
    io.emit('user-left', { userId: socket.id });
    io.emit('state', statePayload());
    console.log(`[-] koptu: ${socket.id} (${io.engine.clientsCount} kişi)`);
  });
});

function pushChat(channelId, msg) {
  const arr = chatHistory.get(channelId) || [];
  arr.push(msg);
  if (arr.length > MAX_HISTORY) arr.shift();
  chatHistory.set(channelId, arr);
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Nexarc Ekip sunucusu çalışıyor → http://0.0.0.0:${PORT}`);
});

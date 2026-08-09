/* ============================================================
   NEXARC EKİP — Sunucu
   3 kişilik ekip sunucusu: ses kanalları, ekran paylaşımı,
   metin kanalları. WebRTC sinyallerini Socket.IO üzerinden
   aktarır; ses/görüntü doğrudan istemciler arasında akar (mesh).
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

/* ------------------------------------------------------------
   MEDYA YÜKLEME (chat'e dosya/foto/video ekleme)
   ------------------------------------------------------------ */
const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_MIMES = new Set([
  'application/pdf', 'text/plain', 'application/zip',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
      const ext = path.extname(String(file.originalname || '')).slice(0, 12);
      cb(null, Date.now() + '-' + Math.random().toString(36).slice(2, 8) + ext);
    },
  }),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB
  fileFilter: (req, file, cb) => {
    const t = String(file.mimetype || '');
    const ok = t.startsWith('image/') || t.startsWith('video/') || t.startsWith('audio/') || ALLOWED_MIMES.has(t);
    cb(null, ok);
  },
});

app.post('/upload', (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: String(err.message || 'yükleme hatası') });
    if (!req.file) return res.status(400).json({ error: 'dosya bulunamadı' });
    res.json({
      url: '/uploads/' + req.file.filename,
      name: String(req.file.originalname || 'dosya').slice(0, 200),
      size: req.file.size,
      type: String(req.file.mimetype || ''),
    });
  });
});

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

const users = new Map();        // socketId -> { id, name, color, avatar, username, voiceChannel, sharing }
const chatHistory = new Map();  // channelId -> [message]
const MAX_HISTORY = 100;

/* ------------------------------------------------------------
   HESAP SİSTEMİ (kayıt / giriş / oturum / profil)
   ------------------------------------------------------------ */
const ACCOUNTS_FILE = path.join(__dirname, 'accounts.json');
let accounts = {};            // username -> { passwordHash, displayName, color, avatar, createdAt }
const sessions = new Map();   // token -> username
const socketAccounts = new Map(); // socketId -> username

function loadAccounts() {
  try {
    if (fs.existsSync(ACCOUNTS_FILE)) accounts = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf8')) || {};
  } catch (e) { console.error('hesaplar okunamadı:', e.message); }
}
function saveAccounts() {
  try { fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2)); }
  catch (e) { console.error('hesaplar kaydedilemedi:', e.message); }
}
loadAccounts();

function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(pw), salt, 64).toString('hex');
  return salt + ':' + hash;
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
  return { username, displayName: a.displayName, color: a.color, avatar: a.avatar || '' };
}

const sanitize = (u) => ({ id: u.id, name: u.name, color: u.color, avatar: u.avatar || '', username: u.username || null, voiceChannel: u.voiceChannel, sharing: u.sharing });
const statePayload = () => ({ users: [...users.values()].map(sanitize) });

function pushChat(channelId, msg) {
  const arr = chatHistory.get(channelId) || [];
  arr.push(msg);
  if (arr.length > MAX_HISTORY) arr.shift();
  chatHistory.set(channelId, arr);
}

io.on('connection', (socket) => {
  console.log(`[+] bağlandı: ${socket.id} (${io.engine.clientsCount} kişi)`);

  /* ---- Kimlik doğrulama: kayıt / giriş / otomatik giriş ---- */
  socket.on('register', ({ username, password, displayName, color, avatar }, cb) => {
    const u = String(username || '').trim().toLowerCase();
    if (!/^[a-z0-9_]{3,20}$/.test(u)) return cb && cb({ ok: false, error: 'Kullanıcı adı 3-20 karakter olmalı (harf, rakam, _)' });
    if (String(password || '').length < 4) return cb && cb({ ok: false, error: 'Şifre en az 4 karakter olmalı' });
    const disp = String(displayName || '').trim();
    if (!disp || disp.length > 24) return cb && cb({ ok: false, error: 'Görünen ad 1-24 karakter olmalı' });
    if (accounts[u]) return cb && cb({ ok: false, error: 'Bu kullanıcı adı zaten alınmış' });
    accounts[u] = {
      passwordHash: hashPassword(password),
      displayName: disp.slice(0, 24),
      color: String(color || '#ff725e').slice(0, 7),
      avatar: String(avatar || '').slice(0, 8),
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

  /* ---- Profil güncelleme ---- */
  socket.on('update-profile', ({ displayName, color, avatar }, cb) => {
    const user = users.get(socket.id);
    if (!user) return cb && cb({ ok: false, error: 'Oturum yok' });
    const disp = String(displayName || '').trim();
    if (!disp || disp.length > 24) return cb && cb({ ok: false, error: 'Görünen ad 1-24 karakter olmalı' });
    user.name = disp.slice(0, 24);
    user.color = String(color || '#ff725e').slice(0, 7);
    user.avatar = String(avatar || '').slice(0, 8);
    const accName = socketAccounts.get(socket.id);
    if (accName && accounts[accName]) {
      accounts[accName].displayName = user.name;
      accounts[accName].color = user.color;
      accounts[accName].avatar = user.avatar;
      saveAccounts();
    }
    io.emit('state', statePayload());
    cb && cb({ ok: true, user: sanitize(user) });
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
      avatar: account ? account.avatar : String(avatar || '').slice(0, 8),
      voiceChannel: null,
      sharing: false,
    };
    users.set(socket.id, user);
    if (account) socketAccounts.set(socket.id, account.username);
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

  /* ---- Kanal oluşturma / silme (Discord benzeri) ---- */
  socket.on('channel-create', ({ name, type }, cb) => {
    const clean = String(name || '').trim().slice(0, 30);
    if (!clean) return cb && cb({ ok: false, error: 'Kanal adı boş olamaz' });
    const t = type === 'voice' ? 'voice' : 'text';
    const base = clean.toLowerCase().replace(/[^a-z0-9çğıöşü_-]/g, '').slice(0, 20) || 'kanal';
    const id = base + '-' + Math.random().toString(36).slice(2, 6);
    CHANNELS.push({ id, name: clean, type: t });
    if (t === 'text') chatHistory.set(id, []);
    io.emit('channels-updated', { channels: CHANNELS });
    cb && cb({ ok: true, channel: { id, name: clean, type: t } });
  });

  socket.on('channel-delete', ({ channelId }, cb) => {
    const idx = CHANNELS.findIndex((c) => c.id === channelId);
    if (idx === -1) return cb && cb({ ok: false, error: 'Kanal bulunamadı' });
    CHANNELS.splice(idx, 1);
    chatHistory.delete(channelId);
    // O ses kanalındaki herkesi çıkar
    for (const u of users.values()) {
      if (u.voiceChannel === channelId) {
        u.voiceChannel = null;
        u.sharing = false;
        const s = io.sockets.sockets.get(u.id);
        if (s) {
          s.leave('ch:' + channelId);
          s.emit('voice-kicked', { channelId });
        }
      }
    }
    io.emit('channels-updated', { channels: CHANNELS });
    io.emit('channel-deleted', { channelId });
    cb && cb({ ok: true });
  });

  /* ---- Mesaj silme (yalnızca kendi mesajını) ---- */
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

  socket.on('chat', ({ channelId, text, media }) => {
    const user = users.get(socket.id);
    const ch = CHANNELS.find((c) => c.id === channelId && c.type === 'text');
    if (!user || !ch) return;
    const msgText = String(text || '').slice(0, 2000);
    // Medya: yalnızca kendi sunucumuzdaki yüklemelere izin ver
    let msgMedia = null;
    if (media && typeof media.url === 'string' && media.url.startsWith('/uploads/')) {
      msgMedia = {
        url: media.url.slice(0, 300),
        name: String(media.name || 'dosya').slice(0, 200),
        size: Number(media.size) || 0,
        type: String(media.type || '').slice(0, 100),
      };
    }
    if (!msgText.trim() && !msgMedia) return;
    const msg = {
      id: socket.id + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
      channelId,
      user: sanitize(user),
      text: msgText,
      media: msgMedia,
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
    socketAccounts.delete(socket.id);
    io.emit('user-left', { userId: socket.id });
    io.emit('state', statePayload());
    console.log(`[-] koptu: ${socket.id} (${io.engine.clientsCount} kişi)`);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Nexarc Ekip sunucusu çalışıyor → http://0.0.0.0:${PORT}`);
});

/* ============================================================
   NEXARC EKİP — İstemci
   WebRTC (mesh): ses + ekran paylaşımı, Socket.IO sinyal iletimi
   ============================================================ */
'use strict';

const $ = (sel) => document.querySelector(sel);

const socket = io();

/* STUN sunucuları (ağ adresi çözümleme). Gerekirse TURN ekleyin:
   { urls: 'turn:...', username: '...', credential: '...' } */
const ICE = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

const COLORS = ['#ff725e', '#5865f2', '#3ba55d', '#faa61a', '#eb459e', '#00b0f4', '#9b59b6', '#23a55a', '#e91e63', '#673ab7', '#00bcd4', '#8bc34a', '#ff9800', '#795548', '#607d8b', '#f44336'];

/* --- Tema: Açık / Koyu / Siyah --- */
const THEMES = ['acik', 'koyu', 'siyah'];
function applyTheme(theme, persist = true) {
  document.body.dataset.theme = theme;
  document.querySelectorAll('#login-theme button').forEach((b) =>
    b.classList.toggle('sel', b.dataset.themeOpt === theme));
  if (persist) { try { localStorage.setItem('nexarc-theme', theme); } catch (e) {} }
}
function initTheme() {
  let saved = 'siyah'; // varsayılan: saf siyah
  try { saved = localStorage.getItem('nexarc-theme') || 'siyah'; } catch (e) {}
  if (!THEMES.includes(saved)) saved = 'siyah';
  applyTheme(saved, false);
  document.querySelectorAll('#login-theme button').forEach((b) => {
    b.onclick = () => applyTheme(b.dataset.themeOpt);
  });
  // Üst bardaki ay ikonu: Açık → Koyu → Siyah → Açık döngüsü
  $('#theme-btn').onclick = () => {
    const idx = THEMES.indexOf(document.body.dataset.theme);
    applyTheme(THEMES[(idx + 1) % THEMES.length]);
  };
}
initTheme();

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const initials = (name) => name.trim().split(/\s+/).map((w) => w[0] || '').join('').slice(0, 2).toUpperCase();
const avatarOf = (u) => (u && u.avatar ? u.avatar : initials((u && u.name) || '?'));
const isPhotoAvatar = (av) => typeof av === 'string' && (av.startsWith('/uploads/') || av.startsWith('http'));
/* Avatar içeriği: fotoğraf ise <img>, değilse emoji/harfler */
function avatarHtml(u) {
  const av = u && u.avatar;
  if (isPhotoAvatar(av)) return `<img class="avatar-img" src="${esc(av)}" alt="" />`;
  return esc(avatarOf(u));
}
const fmtTime = (ts) => new Date(ts).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

/* --- İkonlar (satır içi SVG) --- */
const ICON = {
  hash: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9.5 3 7.5 21M16.5 3l-2 18M3.5 8.5h17M3.5 15.5h17"/></svg>',
  speaker: '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M11 5 6 9H3v6h3l5 4V5z" fill="currentColor"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18 6a8.5 8.5 0 0 1 0 12" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/></svg>',
  mic: '<svg viewBox="0 0 24 24" width="18" height="18"><rect x="9" y="2.5" width="6" height="11" rx="3" fill="currentColor"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3.5" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/></svg>',
  micOff: '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M3 3l18 18" stroke="#f23f43" stroke-width="2" stroke-linecap="round"/><rect x="9" y="2.5" width="6" height="11" rx="3" fill="currentColor"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3.5" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/></svg>',
  share: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="4" width="19" height="12.5" rx="2"/><path d="M8 21h8M12 16.5V21"/><path d="M10.5 9.5l4 2.5-4 2.5z" fill="currentColor" stroke="none"/></svg>',
  expand: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3"/></svg>',
  edit: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
  reply: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 17l-5-5 5-5"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>',
  react: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01"/></svg>',
  pin: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5M5 17h14M7 17l1.5-9h7L17 17M9 8V4h6v4"/></svg>',
  cam: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M23 7 16 12l7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>',
  leave: '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.5 2.1L8 10a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.9.6 2.9.7a2 2 0 0 1 1.7 2z" fill="currentColor"/></svg>',
  dm: '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 2C6.48 2 2 6.02 2 10.97c0 2.88 1.53 5.43 3.92 7.1L5 22l4.26-2.19c.86.2 1.78.31 2.74.31 5.52 0 10-4.02 10-9.15S17.52 2 12 2zm-4.3 9.1a1.3 1.3 0 1 1 0-2.6 1.3 1.3 0 0 1 0 2.6zm4.3 0a1.3 1.3 0 1 1 0-2.6 1.3 1.3 0 0 1 0 2.6zm4.3 0a1.3 1.3 0 1 1 0-2.6 1.3 1.3 0 0 1 0 2.6z"/></svg>',
};

/* --- Durum --- */
const state = {
  self: null,
  channels: [],
  users: new Map(),      // id -> user {id,name,color,voiceChannel,sharing}
  textChannel: null,
  voiceChannel: null,
  wantedVoice: null,     // yeniden bağlantı sonrası dönülecek kanal
  localStream: null,     // mikrofon
  micOn: true,
  screenStream: null,    // ekran paylaşımı (sadece paylaşan kişide)
  voicePCs: new Map(),   // peerId -> { pc, makingOffer, ignoreOffer, polite }  (ses, karşılıklı)
  screenSendPCs: new Map(), // peerId -> meta — BEN bu eşe ekranımı gönderiyorum
  screenRecvPCs: new Map(), // peerId -> meta — BU EŞ bana ekranını gönderiyor
  camSendPCs: new Map(), // peerId -> meta — BEN kameramı gönderiyorum
  camRecvPCs: new Map(), // peerId -> meta — BU EŞ kamerasını gönderiyor
  pendingCands: new Map(),  // 'wireTipi:peerId' -> [candidate...] (yarışı önlemek için)
  audioEls: new Map(),   // peerId -> <audio>
  screens: new Map(),    // sharerId -> MediaStream (uzaktan gelen ekranlar)
  cams: new Map(),       // peerId -> MediaStream (uzaktan gelen kameralar)
  cameraStream: null,
  cameraOn: false,
  joined: false,
  status: 'online',
  speaking: new Set(),   // konuşan peer id'leri
  analysers: new Map(),  // peerId -> AnalyserNode
  audioCtx: null,
  typingTimers: new Map(), // userId -> timeout
  typingUsers: new Map(),  // userId -> name (yazıyor göstergesi)
  pendingReply: null,    // { id, name, text }
  pins: [],
};

// Test/debug için dışarıdan erişim
window.__nexarc = state;

/* Oturum token'ı (kayıt/giriş sonrası saklanır) — connect olayından önce tanımlı olmalı */
const AUTH = { token: null };
try { AUTH.token = localStorage.getItem('nexarc-token') || null; } catch (e) {}
window.__nexarcAuth = AUTH;

/* ============================================================
   GENEL YARDIMCILAR
   ============================================================ */
function toast(text) {
  const wrap = $('#toast-wrap');
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  wrap.appendChild(el);
  setTimeout(() => { el.style.transition = 'opacity .3s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 320); }, 3200);
}

function setConn(ok) {
  $('#conn').classList.toggle('on', ok);
  $('#conn-text').textContent = ok ? 'Bağlı' : 'Bağlantı koptu — yeniden bağlanıyor…';
}

function setTitle(title, sub) {
  $('#channel-title').innerHTML = `<span class="hash">${esc(sub || '')}</span>${esc(title)}`;
}

/* ============================================================
   GİRİŞ / KAYIT / HESAP
   ============================================================ */
const AVATARS = ['🚀', '🦊', '🐼', '🌵', '⚡', '🎧', '🎨', '🧑‍💻', '🐙', '🌙', '🔥', '👑'];
let chosenColor = COLORS[0];
let chosenAvatar = '';

function setAuthMsg(text) {
  const el = $('#auth-msg');
  if (el) el.textContent = text || '';
}

function buildColorPicker(containerSel, onPick) {
  const picker = $(containerSel);
  if (!picker) return;
  picker.innerHTML = '';
  COLORS.forEach((c) => {
    const s = document.createElement('span');
    s.className = 'color-swatch' + (c === chosenColor ? ' sel' : '');
    s.style.background = c;
    s.onclick = () => { chosenColor = c; buildColorPicker(containerSel, onPick); onPick && onPick(c); };
    picker.appendChild(s);
  });
}

function buildAvatarPicker(containerSel, onPick) {
  const picker = $(containerSel);
  if (!picker) return;
  picker.innerHTML = '';
  AVATARS.forEach((a) => {
    const s = document.createElement('span');
    s.className = 'avatar-opt' + (a === chosenAvatar ? ' sel' : '');
    s.textContent = a;
    s.onclick = () => { chosenAvatar = a; buildAvatarPicker(containerSel, onPick); onPick && onPick(a); };
    picker.appendChild(s);
  });
}

function switchAuthTab(tab) {
  document.querySelectorAll('.auth-tabs button').forEach((b) => b.classList.toggle('sel', b.id === 'tab-' + tab));
  $('#panel-login').classList.toggle('hidden', tab !== 'login');
  $('#panel-register').classList.toggle('hidden', tab !== 'register');
  $('#panel-guest').classList.add('hidden');
  $('#guest-link').textContent = 'Misafir olarak devam et';
  setAuthMsg('');
}

$('#tab-login').onclick = () => switchAuthTab('login');
$('#tab-register').onclick = () => switchAuthTab('register');
$('#guest-link').onclick = () => {
  document.querySelectorAll('.auth-tabs button').forEach((b) => b.classList.remove('sel'));
  $('#panel-login').classList.add('hidden');
  $('#panel-register').classList.add('hidden');
  $('#panel-guest').classList.remove('hidden');
  $('#guest-link').textContent = '◀ Giriş yap / Kayıt ol';
  setAuthMsg('');
};

/* Giriş yap */
function doLogin() {
  const username = $('#login-username').value.trim();
  const password = $('#login-password').value;
  if (!username || !password) { setAuthMsg('Kullanıcı adı ve şifre gir'); return; }
  setAuthMsg('');
  socket.emit('login', { username, password }, (res) => {
    if (!res || !res.ok) { setAuthMsg((res && res.error) || 'Giriş başarısız'); return; }
    saveToken(res.token);
    socket.emit('join', { token: res.token });
  });
}

/* Kayıt ol */
function doRegister() {
  const username = $('#reg-username').value.trim();
  const password = $('#reg-password').value;
  const displayName = $('#reg-display').value.trim();
  if (!username || !password || !displayName) { setAuthMsg('Tüm alanları doldur'); return; }
  setAuthMsg('');
  socket.emit('register', { username, password, displayName, color: chosenColor, avatar: chosenAvatar }, (res) => {
    if (!res || !res.ok) { setAuthMsg((res && res.error) || 'Kayıt başarısız'); return; }
    saveToken(res.token);
    socket.emit('join', { token: res.token });
  });
}

/* Misafir */
function doGuest() {
  const name = $('#guest-name').value.trim() || 'Misafir';
  state.joined = true;
  socket.emit('join', { name, color: chosenColor, avatar: chosenAvatar });
}

function saveToken(t) {
  AUTH.token = t;
  try { localStorage.setItem('nexarc-token', t || ''); } catch (e) {}
}

/* Otomatik giriş (kayıtlı token varsa) */
function tryAutoLogin() {
  if (!AUTH.token) return;
  socket.emit('auto-login', { token: AUTH.token }, (res) => {
    if (res && res.ok) socket.emit('join', { token: AUTH.token });
    else { saveToken(null); }
  });
}

$('#login-btn').onclick = doLogin;
$('#login-username').addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });
$('#login-password').addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });
$('#register-btn').onclick = doRegister;
$('#reg-username').addEventListener('keydown', (e) => { if (e.key === 'Enter') doRegister(); });
$('#reg-password').addEventListener('keydown', (e) => { if (e.key === 'Enter') doRegister(); });
$('#reg-display').addEventListener('keydown', (e) => { if (e.key === 'Enter') doRegister(); });
$('#guest-btn').onclick = doGuest;
$('#guest-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') doGuest(); });
buildColorPicker('#reg-color-picker');
buildAvatarPicker('#reg-avatar-pick');
buildColorPicker('#guest-color-picker');
switchAuthTab('login');

/* --- Profil penceresi --- */
function profPreview() {
  const el = $('#prof-avatar-preview');
  if (!el) return;
  if (isPhotoAvatar(chosenAvatar)) {
    el.innerHTML = `<img class="avatar-img" src="${esc(chosenAvatar)}" alt="" />`;
  } else {
    el.innerHTML = esc(chosenAvatar || initials((state.self && state.self.name) || '?'));
  }
}
function openProfile() {
  if (!state.self) return;
  $('#prof-display').value = state.self.name || '';
  $('#prof-status-text').value = state.self.statusText || '';
  chosenAvatar = state.self.avatar || '';
  const isAccount = !!(state.self.username);
  $('#prof-logout').classList.toggle('hidden', !isAccount);
  $('#prof-note').textContent = isAccount
    ? 'Hesabınla girişli — değişiklikler kalıcıdır.'
    : 'Misafirsin — değişiklikler yalnızca bu oturumda geçerli.';
  const stSel = $('#prof-status');
  if (stSel) stSel.value = state.self.status || 'online';
  buildColorPicker('#prof-color-picker');
  populateDevices();
  profPreview();
  $('#prof-emoji-wrap').classList.add('hidden');
  $('#profile-modal').classList.remove('hidden');
}
function closeProfile() { $('#profile-modal').classList.add('hidden'); }

$('#profile-btn').onclick = openProfile;
$('#prof-close').onclick = closeProfile;
$('#profile-modal').addEventListener('click', (e) => { if (e.target === $('#profile-modal')) closeProfile(); });
const profDeviceSel = $('#prof-device');
if (profDeviceSel) profDeviceSel.onchange = () => setPreferredMic(profDeviceSel.value);

/* --- Profil fotoğrafı yükleme --- */
const profPhotoInput = $('#prof-photo-input');
if (profPhotoInput) {
  $('#prof-photo-btn').onclick = () => profPhotoInput.click();
  $('#prof-emoji-btn').onclick = () => {
    $('#prof-emoji-wrap').classList.toggle('hidden');
    if (!$('#prof-emoji-wrap').children.length) {
      const picker = $('#prof-emoji-wrap');
      picker.innerHTML = '';
      AVATARS.forEach((a) => {
        const s = document.createElement('span');
        s.className = 'avatar-opt' + (a === chosenAvatar ? ' sel' : '');
        s.textContent = a;
        s.onclick = () => { chosenAvatar = a; profPreview(); $('#prof-emoji-wrap').classList.add('hidden'); };
        picker.appendChild(s);
      });
    }
  };
  $('#prof-photo-clear').onclick = () => { chosenAvatar = ''; profPreview(); };
  profPhotoInput.onchange = async () => {
    const file = profPhotoInput.files[0];
    profPhotoInput.value = '';
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast('Fotoğraf 5 MB sınırını aşıyor'); return; }
    try {
      const fd = new FormData();
      fd.append('file', file);
      const resp = await fetch('/upload', { method: 'POST', body: fd });
      if (!resp.ok) throw new Error('sunucu hatası');
      const data = await resp.json();
      chosenAvatar = data.url;
      profPreview();
      toast('Fotoğraf yüklendi — Kaydet\'e bas');
    } catch (e) {
      toast('Fotoğraf yüklenemedi');
    }
  };
}

$('#prof-save').onclick = () => {
  const displayName = $('#prof-display').value.trim();
  if (!displayName) { toast('Görünen ad boş olamaz'); return; }
  const status = $('#prof-status') ? $('#prof-status').value : 'online';
  const statusText = $('#prof-status-text') ? $('#prof-status-text').value : '';
  socket.emit('update-profile', { displayName, color: chosenColor, avatar: chosenAvatar, status, statusText }, (res) => {
    if (res && res.ok) {
      state.self = { ...state.self, ...res.user };
      toast('Profil güncellendi');
      closeProfile();
    } else {
      toast((res && res.error) || 'Profil güncellenemedi');
    }
  });
};

$('#prof-logout').onclick = () => {
  saveToken(null);
  location.reload();
};

/* ============================================================
   SOCKET OLAYLARI
   ============================================================ */
socket.on('connect', () => {
  setConn(true);
  if (state.joined && AUTH.token) {
    // Oturum yeniden kuruldu: token ile tekrar katıl
    socket.emit('join', { token: AUTH.token });
  } else if (state.joined) {
    socket.emit('join', { name: state.self?.name || 'Misafir', color: state.self?.color || chosenColor });
  } else {
    tryAutoLogin();
  }
});

socket.on('disconnect', () => setConn(false));

socket.on('init', ({ self, channels }) => {
  state.self = self;
  state.joined = true;
  state.channels = channels;
  $('#login-overlay').classList.add('hidden');
  $('#app').classList.remove('hidden');
  renderChannels();
  renderMembers();
  // Varsayılan metin kanalı
  const firstText = channels.find((c) => c.type === 'text');
  if (firstText) selectTextChannel(firstText.id);
  // Bağlantı koptuysa ses kanalına geri dön
  if (state.wantedVoice) {
    const vc = channels.find((c) => c.id === state.wantedVoice && c.type === 'voice');
    if (vc) { state.wantedVoice = null; joinVoice(vc.id); }
  }
});

socket.on('state', ({ users }) => {
  state.users = new Map(users.map((u) => [u.id, u]));
  renderChannels();
  renderMembers();
  if (state.voiceChannel) renderVoiceGrid();
});

socket.on('user-joined', ({ user }) => toast(`${user.name} sunucuya katıldı`));
socket.on('user-left', ({ userId }) => {
  state.users.delete(userId);
  removePeer(userId);
  if (state.voiceChannel) renderVoiceGrid();
  renderMembers();
  renderChannels();
});

/* --- Metin kanalı --- */
socket.on('chat-history', ({ channelId, messages }) => {
  if (channelId !== state.textChannel) return;
  renderMessages(messages);
});

socket.on('chat', (msg) => {
  if (msg.channelId === state.textChannel) appendMessage(msg);
});

/* --- Ses kanalı --- */
socket.on('voice-joined', async ({ channelId, occupants }) => {
  state.voiceChannel = channelId;
  try {
    const devId = preferredMic();
    state.localStream = await navigator.mediaDevices.getUserMedia(devId ? { audio: { deviceId: { exact: devId } } } : { audio: true });
    state.micOn = true;
    attachAnalyser('self', state.localStream);
  } catch (e) {
    state.localStream = null;
    toast('Mikrofon izni alınamadı — yalnızca dinleme modu');
  }
  updateMicUI();
  updateCamUI();
  for (const occ of occupants) connectVoicePeer(occ);
  showVoiceView();
  renderChannels();
  renderMembers();
  startSpeakingLoop();
  toast('Ses kanalına katıldın');
});

socket.on('voice-user-joined', ({ user }) => {
  if (state.voiceChannel === user.voiceChannel) connectVoicePeer(user);
});

socket.on('voice-user-left', ({ userId }) => {
  removePeer(userId);
  if (state.voiceChannel) renderVoiceGrid();
  renderChannels();
  renderMembers();
});

socket.on('screen-state', ({ userId, sharing }) => {
  const user = state.users.get(userId);
  if (sharing) {
    connectScreenReceiver(userId);
    toast(`${user?.name || 'Biri'} ekran paylaşmaya başladı`);
  } else {
    closeScreenPC(userId);
  }
  renderVoiceGrid();
  renderMembers();
});

/* --- Kanal listesi güncellendi (ekleme/silme) --- */
socket.on('channels-updated', ({ channels }) => {
  state.channels = channels;
  // Aktif metin kanalı silindiyse ilk metin kanalına geç
  if (state.textChannel && !channels.find((c) => c.id === state.textChannel)) {
    const t = channels.find((c) => c.type === 'text');
    if (t) selectTextChannel(t.id);
  }
  // Aktif ses kanalı silindiyse yerel temizlik yap
  if (state.voiceChannel && !channels.find((c) => c.id === state.voiceChannel)) {
    localVoiceReset('Kanal silindi — ses kanalından çıkarıldın');
  }
  renderChannels();
  renderMembers();
  if (state.voiceChannel) renderVoiceGrid();
});

socket.on('voice-kicked', ({ channelId }) => {
  localVoiceReset('Kanal silindi — ses kanalından çıkarıldın');
});

/* --- Mesaj silindi --- */
socket.on('message-deleted', ({ messageId }) => {
  const el = document.querySelector(`.msg[data-mid="${messageId}"]`);
  if (el) el.remove();
});

/* --- Mesaj düzenlendi --- */
socket.on('message-updated', ({ channelId, messageId, text }) => {
  if (channelId !== state.textChannel) return;
  const el = document.querySelector(`.msg[data-mid="${messageId}"]`);
  if (!el) return;
  const t = el.querySelector('.msg-text');
  if (t) t.textContent = text;
  const time = el.querySelector('.msg-time');
  if (time) time.textContent = fmtTime(Date.now()) + ' (düzenlendi)';
});

/* --- Mesaja tepki eklendi/çıkarıldı --- */
socket.on('message-reacted', ({ channelId, messageId, reactions }) => {
  if (channelId !== state.textChannel) return;
  const el = document.querySelector(`.msg[data-mid="${messageId}"]`);
  if (!el) return;
  let box = el.querySelector('.reactions');
  if (!box) {
    box = document.createElement('div');
    box.className = 'reactions';
    el.querySelector('.msg-body').appendChild(box);
  }
  box.innerHTML = '';
  for (const [emoji, ids] of Object.entries(reactions || {})) {
    const mine = ids.includes(state.self?.id);
    const r = document.createElement('span');
    r.className = 'reaction' + (mine ? ' mine' : '');
    r.innerHTML = `<span class="rc">${esc(emoji)}</span><span class="cnt">${ids.length}</span>`;
    r.onclick = () => socket.emit('message-reaction', { channelId, messageId, emoji });
    box.appendChild(r);
  }
});

/* --- Mesaj pinlendi --- */
socket.on('message-pinned', ({ messageId, pinned }) => {
  const el = document.querySelector(`.msg[data-mid="${messageId}"]`);
  if (el) {
    const btn = el.querySelector('.ma-pin');
    if (btn) btn.classList.toggle('active', pinned);
  }
  toast(pinned ? 'Mesaj sabitlendi 📌' : 'Mesaj sabitleme kaldırıldı');
});

/* --- Yazıyor göstergesi --- */
socket.on('typing', ({ channelId, userId, name }) => {
  if (channelId !== state.textChannel) return;
  state.typingUsers.set(userId, name);
  clearTimeout(state.typingTimers.get(userId));
  state.typingTimers.set(userId, setTimeout(() => { state.typingUsers.delete(userId); renderTyping(); }, 3000));
  renderTyping();
});
function renderTyping() {
  const el = $('#typing-ind');
  if (!el) return;
  const names = [...state.typingUsers.values()];
  el.textContent = names.length ? names.join(', ') + (names.length > 1 ? ' yazıyor…' : ' yazıyor…') : '';
}

/* --- Kamera durumu --- */
socket.on('cam-state', ({ userId, on }) => {
  if (on) connectCamReceiver(userId);
  else closeCamPC(userId);
  renderVoiceGrid();
  renderMembers();
});

/* --- Sunucu susturma --- */
socket.on('voice-muted', ({ userId, muted }) => {
  const el = state.audioEls.get(userId);
  if (el) el.muted = muted;
  renderVoiceGrid();
});

/* --- DM açıldı --- */
socket.on('dm-opened', ({ roomId, peer }) => {
  const ch = { id: roomId, name: '@' + peer.name, type: 'text', dm: true };
  if (!state.channels.find((c) => c.id === roomId)) state.channels.push(ch);
  renderChannels();
  selectTextChannel(roomId);
  setTitle(peer.name, '@');
});

/* --- Sinyal --- */
socket.on('signal', ({ from, pcType, data }) => handleSignal(from, pcType, data));

/* ============================================================
   MOBİL MENÜ (hamburger → kanal çekmecesi)
   ============================================================ */
function closeMenu() {
  document.body.classList.remove('menu-open');
  const ov = $('#menu-overlay');
  if (ov) ov.classList.add('hidden');
}
const menuBtn = $('#mobile-menu-btn');
const menuOverlay = $('#menu-overlay');
if (menuBtn) {
  menuBtn.onclick = () => {
    const open = document.body.classList.toggle('menu-open');
    if (menuOverlay) menuOverlay.classList.toggle('hidden', !open);
  };
}
if (menuOverlay) menuOverlay.onclick = closeMenu;

/* ============================================================
   KANAL ARAYÜZÜ
   ============================================================ */
function renderChannels() {
  const texts = $('#text-channels');
  const voices = $('#voice-channels');
  texts.innerHTML = '';
  voices.innerHTML = '';

  for (const ch of state.channels) {
    const del = `<button class="channel-del" title="'${esc(ch.name)}' kanalını sil">✕</button>`;
    if (ch.type === 'text') {
      const isDm = !!ch.dm;
      const el = document.createElement('button');
      el.className = 'channel' + (isDm ? ' dm' : '') + (state.textChannel === ch.id ? ' active' : '');
      el.innerHTML = `${isDm ? ICON.dm : ICON.hash}<span class="ch-name">${esc(ch.name)}</span>`;
      el.onclick = () => selectTextChannel(ch.id);
      if (!isDm) {
        el.innerHTML = `${ICON.hash}<span class="ch-name">${esc(ch.name)}</span>${del}`;
        el.querySelector('.channel-del').onclick = (e) => { e.stopPropagation(); confirmDeleteChannel(ch); };
      }
      texts.appendChild(el);
    } else {
      const el = document.createElement('button');
      const inChannel = state.voiceChannel === ch.id;
      el.className = 'channel' + (inChannel ? ' active' : '');
      const occ = [...state.users.values()].filter((u) => u.voiceChannel === ch.id);
      const dots = occ.length
        ? `<span class="occ-dots">${occ.map((u) => `<span class="occ-dot" style="background:${esc(u.color)}"></span>`).join('')}</span>`
        : '';
      el.innerHTML = `${ICON.speaker}<span class="ch-name">${esc(ch.name)}</span><span class="ch-occupants">${occ.length || ''}</span>${dots}${del}`;
      el.onclick = () => (inChannel ? leaveVoice() : joinVoice(ch.id));
      el.querySelector('.channel-del').onclick = (e) => { e.stopPropagation(); confirmDeleteChannel(ch); };
      voices.appendChild(el);
    }
  }
}

/* ---- Kanal ekleme (yerinde kutucuk) ---- */
let inlineAddType = 'text';
function openInlineAdd(type) {
  inlineAddType = type;
  $('#inline-add').classList.remove('hidden');
  $('#inline-add-name').value = '';
  $('#inline-add-name').focus();
}
function closeInlineAdd() {
  $('#inline-add').classList.add('hidden');
}
function submitInlineAdd() {
  const name = $('#inline-add-name').value.trim();
  if (!name) { toast('Kanal adı yaz'); return; }
  socket.emit('channel-create', { name, type: inlineAddType }, (res) => {
    if (!res || !res.ok) { toast((res && res.error) || 'Kanal oluşturulamadı'); return; }
    toast(`"${res.channel.name}" kanalı oluşturuldu`);
    if (res.channel.type === 'text') selectTextChannel(res.channel.id);
    closeInlineAdd();
  });
}
$('#add-text-btn').onclick = () => openInlineAdd('text');
$('#add-voice-btn').onclick = () => openInlineAdd('voice');
$('#inline-add-ok').onclick = submitInlineAdd;
$('#inline-add-cancel').onclick = closeInlineAdd;
$('#inline-add-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') submitInlineAdd(); if (e.key === 'Escape') closeInlineAdd(); });

/* ---- Kanal silme ---- */
function confirmDeleteChannel(ch) {
  if (!window.confirm(`"${ch.name}" kanalı silinsin mi?`)) return;
  socket.emit('channel-delete', { channelId: ch.id }, (res) => {
    if (!res || !res.ok) toast((res && res.error) || 'Kanal silinemedi');
  });
}

function renderMembers() {
  const box = $('#members');
  $('#members-title').textContent = `ÜYELER — ${state.users.size}`;
  box.innerHTML = '';
  for (const u of state.users.values()) {
    const el = document.createElement('div');
    el.className = 'member';
    el.dataset.uid = u.id;
    const status = u.voiceChannel
      ? (state.channels.find((c) => c.id === u.voiceChannel)?.name || 'ses kanalında')
      : 'Çevrimdışı kanal';
    const statusDot = { online: '🟢', idle: '🟡', dnd: '🔴' }[u.status] || '🟢';
    const roleBadge = u.role === 'admin' ? ' <span title="Admin" style="font-size:11px">🛡</span>' : '';
    el.innerHTML = `
      <span class="avatar" style="background:${esc(u.color)}">${avatarHtml(u)}<span class="presence" style="background:${u.status === 'online' ? 'var(--green)' : (u.status === 'idle' ? '#faa61a' : '#f23f43')}"></span></span>
      <div class="member-info">
        <div class="member-name">${statusDot} ${esc(u.name)}${roleBadge}${u.id === state.self?.id ? ' <span style="color:var(--muted)">(sen)</span>' : ''}</div>
        <div class="member-status">${esc(status)}${u.statusText ? ' · ' + esc(u.statusText) : ''}</div>
      </div>
      ${u.sharing ? `<span class="member-icon" title="Ekran paylaşıyor">${ICON.share}</span>` : ''}`;
    el.onclick = () => openUserCard(u.id);
    box.appendChild(el);
  }
}

/* ---- Ses seviyesi pop-up'ı ---- */
let volPeer = null;
function openVolPop(e, peerId) {
  e.stopPropagation();
  const pop = $('#vol-pop');
  if (!pop) return;
  // Aynı kullanıcıya tekrar basılırsa kapat
  if (pop.dataset.peer === peerId && !pop.classList.contains('hidden')) {
    closeVolPop();
    return;
  }
  volPeer = peerId;
  const r = e.currentTarget.getBoundingClientRect();
  pop.style.left = Math.min(r.left, window.innerWidth - 200) + 'px';
  pop.style.top = (r.bottom + 6) + 'px';
  const slider = pop.querySelector('input');
  const a = state.audioEls.get(peerId);
  const cur = a ? Math.round(a.volume * 100) : 100;
  slider.value = cur;
  pop.querySelector('.vp-val').textContent = cur + '%';
  pop.dataset.peer = peerId;
  pop.classList.remove('hidden');
}
function closeVolPop() {
  const pop = $('#vol-pop');
  if (!pop) return;
  pop.classList.add('hidden');
  pop.dataset.peer = '';
  volPeer = null;
}
const volSlider = document.querySelector('#vol-pop input');
if (volSlider) {
  volSlider.addEventListener('input', (e) => {
    const v = e.target.value / 100;
    const a = state.audioEls.get(volPeer);
    if (a) a.volume = v;
    const lbl = document.querySelector('#vol-pop .vp-val');
    if (lbl) lbl.textContent = Math.round(v * 100) + '%';
  });
}
document.addEventListener('click', (e) => {
  const pop = $('#vol-pop');
  if (!pop || pop.classList.contains('hidden')) return;
  if (!pop.contains(e.target) && !e.target.closest('.vol-btn')) closeVolPop();
});

/* ---- Kullanıcı kartı ---- */
let umUserId = null;
function openUserCard(userId) {
  const u = state.users.get(userId);
  if (!u) return;
  umUserId = userId;
  $('#um-avatar').innerHTML = avatarHtml(u);
  $('#um-avatar').style.background = u.color;
  $('#um-name').textContent = u.name;
  $('#um-tag').textContent = u.username ? '@' + u.username : 'Misafir';
  $('#um-role').innerHTML = u.role === 'admin' ? '🛡 Admin' : 'Üye';
  $('#um-status').textContent = { online: '🟢 Çevrimiçi', idle: '🟡 Boşta', dnd: '🔴 Rahatsız etmeyin' }[u.status] || '🟢 Çevrimiçi';
  const umSt = document.querySelector('.user-status-text');
  if (umSt) umSt.textContent = u.statusText || '';
  $('#um-status').style.display = 'block';
  const inSameVoice = state.voiceChannel && u.voiceChannel === state.voiceChannel && userId !== state.self?.id;
  const muteBtn = $('#um-mute');
  if (inSameVoice) {
    muteBtn.classList.remove('hidden');
    muteBtn.textContent = u.muted ? 'Sesini Aç' : 'Sustur';
  } else {
    muteBtn.classList.add('hidden');
  }
  const dmBtn = $('#um-dm');
  dmBtn.textContent = u.username ? 'Mesaj Gönder' : 'DM yok (hesap gerekli)';
  dmBtn.disabled = !u.username;
  $('#user-modal').classList.remove('hidden');
}
function closeUserCard() { $('#user-modal').classList.add('hidden'); umUserId = null; }
$('#um-close').onclick = closeUserCard;
$('#user-modal').addEventListener('click', (e) => { if (e.target === $('#user-modal')) closeUserCard(); });
$('#um-dm').onclick = () => {
  const u = state.users.get(umUserId);
  if (!u || !u.username) return;
  socket.emit('dm-open', { username: u.username }, (res) => {
    if (res && res.ok) {
      closeUserCard();
      const ch = { id: res.roomId, name: '@' + res.peer.name, type: 'text', dm: true };
      if (!state.channels.find((c) => c.id === res.roomId)) state.channels.push(ch);
      renderChannels();
      selectTextChannel(res.roomId);
      setTitle(res.peer.name, '@');
    } else {
      toast((res && res.error) || 'DM açılamadı');
    }
  });
};
$('#um-mute').onclick = () => {
  const u = state.users.get(umUserId);
  if (!u) return;
  socket.emit('voice-mute', { userId: u.id, muted: !u.muted });
};

function selectTextChannel(channelId) {
  closeMenu(); // mobilde çekmece kapansın
  state.textChannel = channelId;
  renderChannels();
  const ch = state.channels.find((c) => c.id === channelId);
  setTitle(ch?.name || '', ch?.dm ? '@' : '#');
  $('#voice-view').classList.add('hidden');
  $('#text-view').classList.remove('hidden');
  $('#messages').innerHTML = '<div class="msg system"><div class="msg-text">Yükleniyor…</div></div>';
  socket.emit('chat-join', channelId);
  setTimeout(() => $('#chat-input').focus(), 50);
}

function renderMessages(messages) {
  const box = $('#messages');
  box.innerHTML = '';
  if (!messages.length) {
    box.innerHTML = '<div class="msg system"><div class="msg-text">Bu kanalda henüz mesaj yok. İlk mesajı sen yaz!</div></div>';
    return;
  }
  for (const m of messages) appendMessage(m, true);
  box.scrollTop = box.scrollHeight;
}

function appendMessage(msg, scroll) {
  const box = $('#messages');
  const isOwn = msg.user.id === state.self?.id;
  const el = document.createElement('div');
  el.className = 'msg' + (isOwn ? ' own' : '');
  el.dataset.mid = msg.id;
  const replyHtml = msg.replyTo
    ? `<div class="reply-preview" title="${esc(msg.replyTo.text)}"><b>${esc(msg.replyTo.name)}</b> ${esc(msg.replyTo.text)}</div>`
    : '';
  const edited = msg.edited ? ' <span style="color:var(--muted);font-size:11px">(düzenlendi)</span>' : '';
  const actions = `
    <div class="msg-actions">
      ${isOwn ? `<button class="ma-btn ma-edit" title="Düzenle">${ICON.edit}</button>` : ''}
      <button class="ma-btn ma-reply" title="Yanıtla">${ICON.reply}</button>
      <button class="ma-btn ma-react" title="Tepki ekle">${ICON.react}</button>
      <button class="ma-btn ma-pin ${msg.pinned ? 'active' : ''}" title="Sabitle">${ICON.pin}</button>
      ${isOwn ? `<button class="ma-btn ma-del danger" title="Sil">${ICON.leave === '' ? '' : ''}🗑</button>` : ''}
    </div>`;
  el.innerHTML = `
    <span class="avatar" style="background:${esc(msg.user.color)}">${avatarHtml(msg.user)}</span>
    <div class="msg-body">
      ${replyHtml}
      <div class="msg-head"><span class="msg-name">${esc(msg.user.name)}</span><span class="msg-time">${fmtTime(msg.ts)}${edited}</span></div>
      <div class="msg-text">${esc(msg.text || '')}</div>
      ${mediaHtml(msg.media)}
    </div>
    ${actions}`;
  // Aksiyonlar
  const editBtn = el.querySelector('.ma-edit');
  if (editBtn) editBtn.onclick = () => startEditMessage(msg, el);
  const replyBtn = el.querySelector('.ma-reply');
  if (replyBtn) replyBtn.onclick = () => setPendingReply(msg);
  const reactBtn = el.querySelector('.ma-react');
  if (reactBtn) reactBtn.onclick = (e) => openReactPop(e, msg);
  const pinBtn = el.querySelector('.ma-pin');
  if (pinBtn) pinBtn.onclick = () => socket.emit('message-pin', { channelId: state.textChannel, messageId: msg.id });
  const delBtn = el.querySelector('.ma-del');
  if (delBtn) delBtn.onclick = () => {
    socket.emit('delete-message', { channelId: state.textChannel, messageId: msg.id }, (res) => {
      if (!res || !res.ok) toast((res && res.error) || 'Mesaj silinemedi');
    });
  };
  // Tepkiler
  if (msg.reactions && Object.keys(msg.reactions).length) {
    const box2 = document.createElement('div');
    box2.className = 'reactions';
    for (const [emoji, ids] of Object.entries(msg.reactions)) {
      const mine = ids.includes(state.self?.id);
      const r = document.createElement('span');
      r.className = 'reaction' + (mine ? ' mine' : '');
      r.innerHTML = `<span class="rc">${esc(emoji)}</span><span class="cnt">${ids.length}</span>`;
      r.onclick = () => socket.emit('message-reaction', { channelId: state.textChannel, messageId: msg.id, emoji });
      box2.appendChild(r);
    }
    el.querySelector('.msg-body').appendChild(box2);
  }
  box.appendChild(el);
  // Yeni mesaj görünür olsun: en alttaysan veya tarihçe yüklenirken kaydır
  const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 160;
  if (scroll || nearBottom) box.scrollTop = box.scrollHeight;
}

$('#chat-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = $('#chat-input');
  const text = input.value.trim();
  if (!text || !state.textChannel) return;
  const replyTo = state.pendingReply ? { id: state.pendingReply.id } : null;
  socket.emit('chat', { channelId: state.textChannel, text, replyTo });
  input.value = '';
  setPendingReply(null);
  input.focus();
  // Kendi mesajını gönderince chat otomatik en alta kayar
  $('#messages').scrollTop = $('#messages').scrollHeight;
});

/* --- Yazıyor göstergesi gönderimi --- */
let lastTyping = 0;
const chatInputEl = $('#chat-input');
if (chatInputEl) {
  chatInputEl.addEventListener('input', () => {
    if (!state.textChannel) return;
    const now = Date.now();
    if (now - lastTyping > 1500) {
      lastTyping = now;
      socket.emit('typing', { channelId: state.textChannel });
    }
  });
}

/* --- Alıntı (yanıt) çipi --- */
function setPendingReply(msg) {
  state.pendingReply = msg ? { id: msg.id, name: msg.user.name, text: msg.text } : null;
  let chip = $('#reply-chip');
  if (!msg) {
    if (chip) chip.remove();
    return;
  }
  if (!chip) {
    chip = document.createElement('div');
    chip.id = 'reply-chip';
    const info = document.createElement('span');
    info.className = 'rc-info';
    const cancel = document.createElement('button');
    cancel.className = 'rc-cancel';
    cancel.textContent = '✕';
    cancel.onclick = () => setPendingReply(null);
    chip.append(info, cancel);
    document.querySelector('#text-view').insertBefore(chip, $('#chat-form'));
  }
  chip.querySelector('.rc-info').textContent = `↩ ${msg.user.name}: ${String(msg.text || 'medya').slice(0, 60)}`;
  $('#chat-input').focus();
}

/* --- Mesaj düzenleme --- */
function startEditMessage(msg, el) {
  const old = el.querySelector('.msg-text');
  const box = document.createElement('div');
  box.className = 'msg-edit-box';
  box.innerHTML = `<input maxlength="2000" value="${esc(msg.text || '')}" /><button class="mini-btn">Kaydet</button><button class="mini-btn ghost">İptal</button>`;
  if (old) old.replaceWith(box);
  const input = box.querySelector('input');
  input.focus();
  const done = (save) => {
    if (save) {
      socket.emit('message-update', { channelId: state.textChannel, messageId: msg.id, text: input.value }, (res) => {
        if (!res || !res.ok) toast((res && res.error) || 'Güncellenemedi');
      });
    }
    const t = document.createElement('div');
    t.className = 'msg-text';
    t.textContent = save ? input.value : msg.text;
    box.replaceWith(t);
  };
  box.querySelector('.mini-btn').onclick = () => done(true);
  box.querySelector('.mini-btn.ghost').onclick = () => done(false);
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') done(true);
    if (ev.key === 'Escape') done(false);
  });
}

/* --- Tepki popover --- */
const REACT_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥', '🎉', '👏', '🤝', '💯', '😍', '😡'];
function openReactPop(e, msg) {
  e.stopPropagation();
  const pop = $('#react-pop');
  const r = e.currentTarget.getBoundingClientRect();
  pop.innerHTML = '';
  REACT_EMOJIS.forEach((em) => {
    const s = document.createElement('span');
    s.className = 'emoji-item';
    s.textContent = em;
    s.onclick = () => {
      socket.emit('message-reaction', { channelId: state.textChannel, messageId: msg.id, emoji: em });
      pop.classList.add('hidden');
    };
    pop.appendChild(s);
  });
  pop.classList.remove('hidden');
  pop.style.left = Math.min(r.left, window.innerWidth - 240) + 'px';
  pop.style.top = (r.bottom + 4) + 'px';
  setTimeout(() => {
    document.addEventListener('click', function h(ev2) {
      if (!pop.contains(ev2.target)) { pop.classList.add('hidden'); document.removeEventListener('click', h); }
    });
  }, 0);
}

/* --- Medya yükleme (📎) --- */
function fmtSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

function mediaHtml(m) {
  if (!m || !m.url) return '';
  const t = String(m.type || '');
  const url = esc(m.url);
  const name = esc(m.name || 'dosya');
  if (t.startsWith('image/')) {
    return `<div class="chat-media"><a href="${url}" target="_blank" rel="noopener"><img src="${url}" alt="${name}" loading="lazy"/></a></div>`;
  }
  if (t.startsWith('video/')) {
    return `<div class="chat-media"><video src="${url}" controls preload="metadata"></video></div>`;
  }
  if (t.startsWith('audio/')) {
    return `<div class="chat-media"><audio src="${url}" controls preload="metadata"></audio></div>`;
  }
  return `<div class="chat-media"><a class="media-file" href="${url}" download="${name}"><span>📄</span><span class="mf-name">${name}</span><span class="mf-size">${fmtSize(m.size)}</span></a></div>`;
}

/* ---- Konuşan vurgusu (ses analizi) ---- */
function attachAnalyser(peerId, stream) {
  try {
    const audioTrack = stream.getAudioTracks()[0];
    if (!audioTrack) return;
    const ctx = state.audioCtx || (state.audioCtx = new (window.AudioContext || window.webkitAudioContext)());
    const src = ctx.createMediaStreamSource(stream);
    const an = ctx.createAnalyser();
    an.fftSize = 512;
    an.smoothingTimeConstant = 0.6;
    src.connect(an);
    state.analysers.set(peerId, an);
  } catch (e) { /* sessizce geç */ }
}
function startSpeakingLoop() {
  if (state.speakingLoop) return;
  state.speakingLoop = setInterval(() => {
    const buf = new Uint8Array(512);
    let changed = false;
    for (const [peerId, an] of state.analysers) {
      an.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
      const level = Math.sqrt(sum / buf.length);
      const speaking = level > 0.045;
      if (speaking !== state.speaking.has(peerId)) {
        if (speaking) state.speaking.add(peerId); else state.speaking.delete(peerId);
        changed = true;
      }
    }
    if (changed) {
      for (const peerId of state.speaking) {
        const card = document.querySelector(`.voice-card[data-peer="${peerId}"]`);
        if (card) card.classList.add('speaking');
      }
      document.querySelectorAll('.voice-card.speaking').forEach((c) => {
        if (!state.speaking.has(c.dataset.peer)) c.classList.remove('speaking');
      });
    }
  }, 150);
}

/* ---- Mikrofon cihazı seçimi ---- */
function preferredMic() {
  try { return localStorage.getItem('nexarc-mic') || null; } catch (e) { return null; }
}
function setPreferredMic(id) {
  try { localStorage.setItem('nexarc-mic', id || ''); } catch (e) {}
}
async function populateDevices() {
  const sel = $('#prof-device');
  if (!sel) return;
  try {
    const devs = await navigator.mediaDevices.enumerateDevices();
    const mics = devs.filter((d) => d.kind === 'audioinput');
    sel.innerHTML = '<option value="">Varsayılan</option>';
    mics.forEach((m) => {
      const o = document.createElement('option');
      o.value = m.deviceId;
      o.textContent = m.label || ('Mikrofon ' + (mics.indexOf(m) + 1));
      sel.appendChild(o);
    });
    const cur = preferredMic();
    if (cur) sel.value = cur;
  } catch (e) {}
}

/* --- Emoji paleti --- */
const EMOJIS = ['ツ','😀','😁','😂','🤣','😊','😍','🤩','😎','🥳','😢','😭','😡','🤯','😴','🤔','🙄','👍','👎','👏','🙏','💪','🤝','✌️','🤞','👌','❤️','🧡','💛','💚','💙','💜','🖤','🤍','💯','🔥','✨','🎉','🎂','🎁','💡','🚀','⭐','🌟','🌈','☀️','🌙','⚡','🐶','🐱','🦊','🐼','🐸','🐙','🦄','🌵','🌸','🍕','🍔','☕','🍀','🎧','🎨','👑'];
function buildEmojiPicker() {
  const box = $('#emoji-picker');
  if (!box || box.children.length) return;
  EMOJIS.forEach((e) => {
    const s = document.createElement('span');
    s.className = 'emoji-item';
    s.textContent = e;
    s.onclick = () => insertEmoji(e);
    box.appendChild(s);
  });
}
function insertEmoji(e) {
  const input = $('#chat-input');
  const pos = input.selectionStart ?? input.value.length;
  input.value = input.value.slice(0, pos) + e + input.value.slice(pos);
  input.focus();
  const np = pos + e.length;
  try { input.setSelectionRange(np, np); } catch (err) {}
}
const emojiBtn = $('#emoji-btn');
if (emojiBtn) {
  buildEmojiPicker();
  emojiBtn.onclick = (e) => { e.preventDefault(); $('#emoji-picker').classList.toggle('hidden'); };
  document.addEventListener('click', (e) => {
    const picker = $('#emoji-picker');
    if (!picker || picker.classList.contains('hidden')) return;
    if (!picker.contains(e.target) && e.target !== emojiBtn) picker.classList.add('hidden');
  });
}

const attachBtn = $('#attach-btn');
const mediaInput = $('#media-input');
if (attachBtn && mediaInput) {
  attachBtn.onclick = (e) => { e.preventDefault(); mediaInput.click(); };
  mediaInput.onchange = async () => {
    const file = mediaInput.files[0];
    mediaInput.value = '';
    if (!file) return;
    if (!state.textChannel) { toast('Önce bir metin kanalı seç'); return; }
    if (file.size > 25 * 1024 * 1024) { toast('Dosya 25 MB sınırını aşıyor'); return; }
    const btn = attachBtn;
    const orig = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="upload-spin"></span>';
    try {
      const fd = new FormData();
      fd.append('file', file);
      const resp = await fetch('/upload', { method: 'POST', body: fd });
      if (!resp.ok) throw new Error('sunucu hatası');
      const data = await resp.json();
      socket.emit('chat', {
        channelId: state.textChannel,
        text: '',
        media: { url: data.url, name: data.name, size: data.size, type: data.type },
      });
      $('#messages').scrollTop = $('#messages').scrollHeight;
    } catch (e) {
      toast('Dosya yüklenemedi — tekrar dene');
    } finally {
      btn.disabled = false;
      btn.innerHTML = orig;
    }
  };
}

/* ============================================================
   SES GÖRÜNÜMÜ
   ============================================================ */
function showVoiceView() {
  $('#text-view').classList.add('hidden');
  $('#voice-view').classList.remove('hidden');
  const ch = state.channels.find((c) => c.id === state.voiceChannel);
  setTitle(ch?.name || '', '');
  renderVoiceGrid();
  updateMicUI();
  updateShareUI();
}

function renderVoiceGrid() {
  const grid = $('#voice-grid');
  grid.innerHTML = '';
  const members = [...state.users.values()].filter((u) => u.voiceChannel === state.voiceChannel);
  for (const u of members) {
    const isSelf = u.id === state.self?.id;
    // Kamera açıkken kendi profil kartını gizle — sadece kamera görünsün
    if (isSelf && state.cameraOn) continue;
    const el = document.createElement('div');
    el.className = 'voice-card' + (isSelf ? ' self' : '') + (state.speaking.has(u.id) ? ' speaking' : '');
    el.dataset.peer = u.id;
    const muteBadge = isSelf && !state.micOn
      ? `<span class="mute-badge">${ICON.micOff}</span>` : '';
    const serverMuted = u.muted ? '<span class="muted-badge">Susturuldu</span>' : '';
    let statusText = 'Ses kanalında';
    if (isSelf) statusText = state.micOn ? 'Mikrofon açık' : 'Mikrofon kapalı';
    if (u.sharing) statusText = '<span class="badge-share">Ekran Paylaşılıyor</span>';
    if (u.camera) statusText += ' ' + (statusText.startsWith('<') ? '' : '') + '<span class="badge-share">📷</span>';
    const vol = !isSelf
      ? `<button class="vol-btn" data-vol="${esc(u.id)}" title="Ses seviyesi">🔊</button>`
      : '';
    el.innerHTML = `
      <span class="avatar" style="background:${esc(u.color)}">${avatarHtml(u)}${muteBadge}</span>
      <div class="vcard-name">${esc(u.name)}${isSelf ? ' <span style="color:var(--muted)">(sen)</span>' : ''} ${serverMuted}</div>
      <div class="vcard-status">${statusText}</div>
      ${vol}`;
    if (!isSelf) {
      const vb = el.querySelector('.vol-btn');
      if (vb) vb.onclick = (e) => openVolPop(e, u.id);
    }
    grid.appendChild(el);
  }
  // Kamera kartları (kendi kameran + uzaktan gelenler)
  if (state.cameraOn && state.cameraStream) {
    const card = document.createElement('div');
    card.className = 'cam-card self-cam';
    const video = document.createElement('video');
    video.autoplay = true;
    video.playsInline = true;
    video.muted = true;
    video.srcObject = state.cameraStream;
    video.play().catch(() => {});
    const name = document.createElement('div');
    name.className = 'cam-name';
    name.textContent = 'Sen 📷';
    card.append(video, name);
    grid.appendChild(card);
  }
  for (const [peerId, stream] of state.cams) {
    const user = state.users.get(peerId);
    const card = document.createElement('div');
    card.className = 'cam-card';
    card.dataset.cam = peerId;
    const video = document.createElement('video');
    video.autoplay = true;
    video.playsInline = true;
    video.muted = true;
    video.srcObject = stream;
    video.play().catch(() => {});
    const name = document.createElement('div');
    name.className = 'cam-name';
    name.textContent = user?.name || 'Kamera';
    card.append(video, name);
    grid.appendChild(card);
  }
}

/* Ekran paylaşımı alanı — her paylaşan için bir kart + kendi ekranın da görünür */
function renderScreenArea() {
  const area = $('#screen-area');
  const entries = [];
  // Paylaşan kişi kendi ekranını da görür
  if (state.screenStream) entries.push({ peerId: 'self', stream: state.screenStream, isSelf: true });
  for (const [peerId, stream] of state.screens) entries.push({ peerId, stream, isSelf: false });

  if (!entries.length) {
    area.classList.add('hidden');
    area.innerHTML = '';
    return;
  }
  area.classList.remove('hidden');

  for (const { peerId, stream, isSelf } of entries) {
    let card = area.querySelector(`.screen-card[data-peer="${peerId}"]`);
    if (!card) {
      card = document.createElement('div');
      card.className = 'screen-card';
      card.dataset.peer = peerId;
      const label = document.createElement('div');
      label.className = 'screen-label';
      label.innerHTML = '<span class="live-dot"></span><span class="screen-name"></span>';
      const video = document.createElement('video');
      video.autoplay = true;
      video.playsInline = true;
      video.muted = true;
      const actions = document.createElement('div');
      actions.className = 'screen-actions';
      const zoomBtn = document.createElement('button');
      zoomBtn.className = 'screen-btn';
      zoomBtn.title = 'Büyüt';
      zoomBtn.innerHTML = ICON.expand;
      zoomBtn.onclick = () => openScreenLightbox(peerId, isSelf);
      actions.appendChild(zoomBtn);
      card.append(label, video, actions);
      area.appendChild(card);
    }
    const user = isSelf ? null : state.users.get(peerId);
    card.querySelector('.screen-name').textContent = isSelf
      ? 'Sen ekranını paylaşıyorsun'
      : `${user?.name || 'Biri'} ekranını paylaşıyor`;
    const video = card.querySelector('video');
    if (video.srcObject !== stream) video.srcObject = stream;
    video.play().catch(() => {});
  }
  // Kaldırılan paylaşımların kartlarını temizle
  for (const card of area.querySelectorAll('.screen-card')) {
    if (!entries.some((e) => e.peerId === card.dataset.peer)) card.remove();
  }
}

/* ---- Tam ekran görüntüleyici (lightbox) ---- */
let lbPeer = null;
let lbZoom = 1;

function openScreenLightbox(peerId, isSelf) {
  const stream = isSelf ? state.screenStream : state.screens.get(peerId);
  const lb = $('#screen-lightbox');
  if (!stream) { toast('Ekran akışı bulunamadı — paylaşım hâlâ kuruluyor'); return; }
  if (!lb) { toast('Görüntüleyici eksik — sayfayı yenile (Ctrl+F5)'); return; }
  const video = $('#lightbox-video');
  if (!video) { toast('Video alanı eksik — sayfayı yenile (Ctrl+F5)'); return; }
  lbPeer = peerId;
  const user = isSelf ? null : state.users.get(peerId);
  const title = document.querySelector('.lightbox-title');
  if (title) title.textContent = isSelf ? 'Senin ekranın' : `${user?.name || 'Biri'} ekranı`;
  video.srcObject = stream;
  lb.classList.remove('hidden');
  setLightboxZoom(1);
  video.play().catch(() => {});
}

function closeScreenLightbox() {
  const lb = $('#screen-lightbox');
  if (!lb || lb.classList.contains('hidden')) return;
  lb.classList.add('hidden');
  const video = $('#lightbox-video');
  if (video) video.srcObject = null;
  lbPeer = null;
}

function setLightboxZoom(z) {
  lbZoom = Math.min(4, Math.max(1, z));
  const video = $('#lightbox-video');
  if (video) video.style.transform = `scale(${lbZoom})`;
  const btn = document.querySelector('#lb-zoom-reset');
  if (btn) btn.textContent = Math.round(lbZoom * 100) + '%';
}

const lbIn = $('#lb-zoom-in'), lbOut = $('#lb-zoom-out'), lbReset = $('#lb-zoom-reset'), lbClose = $('#lb-close');
if (lbIn) lbIn.onclick = () => setLightboxZoom(lbZoom + 0.25);
if (lbOut) lbOut.onclick = () => setLightboxZoom(lbZoom - 0.25);
if (lbReset) lbReset.onclick = () => setLightboxZoom(1);
if (lbClose) lbClose.onclick = closeScreenLightbox;
const lbBox = $('#screen-lightbox');
if (lbBox) lbBox.addEventListener('click', (e) => { if (e.target === lbBox) closeScreenLightbox(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeScreenLightbox(); });

/* ============================================================
   WEBRTC — EŞ BAĞLANTILARI
   ============================================================
   Telsiz türleri (wire types):
   - 'voice'        : ses bağlantısı (iki taraf da gönderir/öder)
   - 'screen-send'  : "Ben bu eşe ekranımı gönderiyorum" (paylaşan tarafın PC'si)
   - 'screen-recv'  : "Bu eşin ekranını alıyorum" (izleyen tarafın PC'si)
   ============================================================ */
function sendSignal(to, wireType, data) {
  socket.emit('signal', { to, pcType: wireType, data });
}

/* Track'leri bir MediaStream'e sar (alıcıda e.streams[0] çalışsın) */
function makeStream(tracks) {
  const s = new MediaStream();
  tracks.forEach((t) => s.addTrack(t));
  return s;
}

/* --- ICE adayı tamponu: PC daha kurulmadan gelen adayları beklet --- */
function bufferCandidate(key, candidate) {
  const arr = state.pendingCands.get(key) || [];
  arr.push(candidate);
  state.pendingCands.set(key, arr);
}
function flushCandidates(key, meta) {
  const arr = state.pendingCands.get(key);
  if (!arr) return;
  state.pendingCands.delete(key);
  arr.forEach((c) => { try { meta.pc.addIceCandidate(c); } catch (e) { console.warn('tampon aday eklenemedi:', e); } });
}

function createPC(peerId, sendType, tracks, recvType) {
  const pc = new RTCPeerConnection(ICE);
  const meta = { pc, makingOffer: false, ignoreOffer: false, polite: state.self.id < peerId };
  // Alıcı PC'ler (ekran/kamera izleyen taraf) yalnızca answer üretir — collision'ı önler
  const isReceiver = sendType === 'cam-recv' || sendType === 'screen-recv';
  if (tracks.length) {
    const stream = makeStream(tracks);
    tracks.forEach((t) => pc.addTrack(t, stream));
  } else if (isReceiver) {
    try { pc.addTransceiver('video', { direction: 'recvonly' }); } catch (e) {}
  }

  pc.onicecandidate = (e) => { if (e.candidate) sendSignal(peerId, sendType, { candidate: e.candidate }); };

  pc.ontrack = (e) => {
    // Bazı tarayıcılarda e.streams boş olabilir → track'ten akış kur (güvenli yol)
    const stream = (e.streams && e.streams[0]) ? e.streams[0] : new MediaStream([e.track]);
    if (sendType === 'voice') {
      let el = state.audioEls.get(peerId);
      if (!el) {
        el = document.createElement('audio');
        el.autoplay = true;
        el.style.display = 'none';
        document.body.appendChild(el);
        state.audioEls.set(peerId, el);
      }
      el.srcObject = stream;
      el.play().catch(() => {});
      attachAnalyser(peerId, stream);
    } else if (sendType === 'cam-recv') {
      state.cams.set(peerId, stream);
      renderVoiceGrid();
    } else {
      state.screens.set(peerId, stream);
      renderScreenArea();
    }
  };

  pc.onnegotiationneeded = async () => {
    if (isReceiver) return; // alıcılar teklif atmaz, yalnızca cevap verir
    try {
      meta.makingOffer = true;
      await pc.setLocalDescription();
      sendSignal(peerId, sendType, { description: pc.localDescription });
    } catch (err) {
      console.error('offer hatası:', err);
    } finally {
      meta.makingOffer = false;
    }
  };

  const map = sendType === 'voice' ? state.voicePCs
    : (sendType === 'screen-send' ? state.screenSendPCs
      : (sendType === 'cam-send' ? state.camSendPCs
        : (sendType === 'cam-recv' ? state.camRecvPCs : state.screenRecvPCs)));
  map.set(peerId, meta);
  // Bekleyen ICE adaylarını bu PC'ye aktar (tampon anahtarı = recvType)
  flushCandidates(recvType + ':' + peerId, meta);
  return meta;
}

/* Gelen sinyalin hangi yerel PC'ye ait olduğunu bul (gerekirse kur) */
function getMetaForSignal(wireType, from) {
  if (wireType === 'voice') {
    let meta = state.voicePCs.get(from);
    if (!meta) {
      const user = state.users.get(from);
      if (user && state.voiceChannel && user.voiceChannel === state.voiceChannel) {
        connectVoicePeer(user);
        meta = state.voicePCs.get(from);
      }
    }
    return meta;
  }
  if (wireType === 'screen-send') {
    // Karşı taraf bana ekran teklifi (offer) gönderiyor → benim alıcı PC'm
    let meta = state.screenRecvPCs.get(from);
    if (!meta) {
      const user = state.users.get(from);
      if (user && user.sharing) {
        connectScreenReceiver(from);
        meta = state.screenRecvPCs.get(from);
      }
    }
    return meta;
  }
  if (wireType === 'cam-send') {
    // Karşı taraf kamera teklifi gönderiyor → benim kamera alıcı PC'm
    let meta = state.camRecvPCs.get(from);
    if (!meta) {
      const user = state.users.get(from);
      if (user && user.camera) {
        connectCamReceiver(from);
        meta = state.camRecvPCs.get(from);
      }
    }
    return meta;
  }
  if (wireType === 'cam-recv') {
    // Karşı tarafın kamera cevabı → benim gönderici PC'm
    let meta = state.camSendPCs.get(from);
    if (!meta && state.cameraStream) {
      createPC(from, 'cam-send', state.cameraStream.getTracks(), 'cam-recv');
      meta = state.camSendPCs.get(from);
    }
    return meta;
  }
  // 'screen-recv' — karşı tarafın verdiği cevap → benim gönderici PC'm
  let meta = state.screenSendPCs.get(from);
  if (!meta && state.screenStream) {
    createPC(from, 'screen-send', state.screenStream.getTracks(), 'screen-recv');
    meta = state.screenSendPCs.get(from);
  }
  return meta;
}

async function handleSignal(from, wireType, data) {
  // PC yoksa ve sadece aday geldiyse → tamponla
  const pre = (wireType === 'voice' ? state.voicePCs
    : (wireType === 'screen-send' ? state.screenRecvPCs
      : (wireType === 'cam-send' ? state.camRecvPCs
        : (wireType === 'cam-recv' ? state.camSendPCs : state.screenSendPCs)))).get(from);
  if (!pre && data.candidate) {
    bufferCandidate(wireType + ':' + from, data.candidate);
    return;
  }

  const meta = pre || getMetaForSignal(wireType, from);
  if (!meta) return;
  const { pc } = meta;

  if (data.candidate) {
    try { await pc.addIceCandidate(data.candidate); } catch (e) { console.warn('ICE hatası:', e); }
    return;
  }
  if (data.description) {
    const offerCollision = data.description.type === 'offer' && (meta.makingOffer || pc.signalingState !== 'stable');
    meta.ignoreOffer = !meta.polite && offerCollision;
    if (meta.ignoreOffer) return;
    try {
      await pc.setRemoteDescription(data.description);
    } catch (e) {
      if (offerCollision) {
        try {
          await pc.setLocalDescription({ type: 'rollback' });
          await pc.setRemoteDescription(data.description);
        } catch (e2) { console.error('rollback hatası:', e2); return; }
      } else {
        console.error('setRemoteDescription hatası:', e);
        return;
      }
    }
    if (data.description.type === 'offer') {
      // Cevap türü: gelen türün karşılığı
      const answerType = wireType === 'voice' ? 'voice'
        : (wireType === 'screen-send' ? 'screen-recv'
          : (wireType === 'cam-send' ? 'cam-recv'
            : (wireType === 'cam-recv' ? 'cam-send' : 'screen-send')));
      try {
        await pc.setLocalDescription();
        sendSignal(from, answerType, { description: pc.localDescription });
      } catch (e) { console.error('answer hatası:', e); }
    }
  }
}

/* Ses kanalına bağlan: kullanıcıya ses PC'si kur */
function connectVoicePeer(user) {
  if (state.voicePCs.has(user.id)) return;
  const tracks = state.localStream ? state.localStream.getTracks() : [];
  createPC(user.id, 'voice', tracks, 'voice');
  // Ben ekran paylaşıyorsam, yeni gelen kişiye ekranı gönder
  if (state.screenStream) {
    if (!state.screenSendPCs.has(user.id)) {
      createPC(user.id, 'screen-send', state.screenStream.getTracks(), 'screen-recv');
    }
  }
  // Ben kameramı açıksa gönder
  if (state.cameraStream && !state.camSendPCs.has(user.id)) {
    createPC(user.id, 'cam-send', state.cameraStream.getTracks(), 'cam-recv');
  }
  // Karşı taraf paylaşıyorsa ekranını al
  if (user.sharing) connectScreenReceiver(user.id);
  // Karşı taraf kamerası açıksa al
  if (user.camera) connectCamReceiver(user.id);
  renderVoiceGrid();
}

function connectScreenReceiver(peerId) {
  if (state.screenRecvPCs.has(peerId)) return;
  createPC(peerId, 'screen-recv', [], 'screen-send');
}

/* --- Kamera --- */
function connectCamReceiver(peerId) {
  if (state.camRecvPCs.has(peerId)) return;
  createPC(peerId, 'cam-recv', [], 'cam-send');
}
function closeCamPC(peerId) {
  const send = state.camSendPCs.get(peerId);
  if (send) { try { send.pc.close(); } catch (e) {} state.camSendPCs.delete(peerId); }
  const recv = state.camRecvPCs.get(peerId);
  if (recv) { try { recv.pc.close(); } catch (e) {} state.camRecvPCs.delete(peerId); }
  state.cams.delete(peerId);
}

async function toggleCamera() {
  if (state.cameraOn) { stopCamera(); return; }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    state.cameraStream = stream;
    state.cameraOn = true;
    socket.emit('cam-start');
    for (const peerId of state.voicePCs.keys()) {
      if (!state.camSendPCs.has(peerId)) createPC(peerId, 'cam-send', stream.getTracks(), 'cam-recv');
    }
    updateCamUI();
    renderVoiceGrid();
    toast('Kamera açıldı 📷');
  } catch (e) {
    toast('Kamera başlatılamadı (izne gerek var)');
  }
}
function stopCamera() {
  if (!state.cameraStream) return;
  state.cameraStream.getTracks().forEach((t) => t.stop());
  state.cameraStream = null;
  state.cameraOn = false;
  for (const id of [...state.camSendPCs.keys()]) closeCamPC(id);
  socket.emit('cam-stop');
  updateCamUI();
  renderVoiceGrid();
}
function updateCamUI() {
  const btn = $('#cam-btn');
  if (!btn) return;
  btn.innerHTML = `${ICON.cam}<span>${state.cameraOn ? 'Kamerayı Kapat' : 'Kamera'}</span>`;
  btn.classList.toggle('active', state.cameraOn);
}

function closeScreenPC(peerId) {
  const send = state.screenSendPCs.get(peerId);
  if (send) { try { send.pc.close(); } catch (e) {} state.screenSendPCs.delete(peerId); }
  const recv = state.screenRecvPCs.get(peerId);
  if (recv) { try { recv.pc.close(); } catch (e) {} state.screenRecvPCs.delete(peerId); }
  state.screens.delete(peerId);
  if (lbPeer === peerId) closeScreenLightbox();
  renderScreenArea();
}

function removePeer(peerId) {
  const meta = state.voicePCs.get(peerId);
  if (meta) { try { meta.pc.close(); } catch (e) {} state.voicePCs.delete(peerId); }
  closeScreenPC(peerId);
  closeCamPC(peerId);
  const el = state.audioEls.get(peerId);
  if (el) { el.srcObject = null; el.remove(); state.audioEls.delete(peerId); }
  state.speaking.delete(peerId);
  state.pendingCands.delete('voice:' + peerId);
  state.pendingCands.delete('screen-send:' + peerId);
  state.pendingCands.delete('screen-recv:' + peerId);
  state.pendingCands.delete('cam-send:' + peerId);
  state.pendingCands.delete('cam-recv:' + peerId);
}

/* ============================================================
   SES KANALI KONTROLLERİ
   ============================================================ */
function joinVoice(channelId) {
  closeMenu(); // mobilde çekmece kapansın
  state.wantedVoice = channelId;
  socket.emit('voice-join', { channelId });
}

/* Ses kanalı durumunu yerel olarak sıfırla (çıkış veya kanal silinmesi) */
function localVoiceReset(toastMsg) {
  state.wantedVoice = null;
  for (const id of [...state.voicePCs.keys()]) removePeer(id);
  if (state.localStream) { state.localStream.getTracks().forEach((t) => t.stop()); state.localStream = null; }
  if (state.screenStream) stopScreen();
  if (state.cameraStream) stopCamera();
  state.voiceChannel = null;
  $('#voice-view').classList.add('hidden');
  if (toastMsg) toast(toastMsg);
  if (!state.textChannel || !state.channels.find((c) => c.id === state.textChannel)) {
    const t = state.channels.find((c) => c.type === 'text');
    if (t) selectTextChannel(t.id);
  } else if ($('#text-view').classList.contains('hidden')) {
    selectTextChannel(state.textChannel);
  }
  renderChannels();
  renderMembers();
}

function leaveVoice() {
  state.wantedVoice = null;
  socket.emit('voice-leave');
  localVoiceReset();
}

function toggleMic() {
  if (!state.localStream) { toast('Mikrofon yok — izin verilmedi'); return; }
  state.micOn = !state.micOn;
  state.localStream.getAudioTracks().forEach((t) => { t.enabled = state.micOn; });
  updateMicUI();
  renderVoiceGrid();
}

function updateMicUI() {
  const btn = $('#mic-btn');
  btn.innerHTML = `${state.micOn ? ICON.mic : ICON.micOff}<span>${state.micOn ? 'Mikrofonu Kapat' : 'Mikrofonu Aç'}</span>`;
  btn.classList.toggle('active', !state.micOn);
}

async function toggleScreen() {
  if (state.screenStream) { stopScreen(); return; }
  try {
    // Yüksek kalite: mümkün olan en yüksek çözünürlük + 60 FPS iste
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        frameRate: { ideal: 60, max: 60 },
        width: { ideal: 2560, max: 3840 },
        height: { ideal: 1440, max: 2160 },
      },
      audio: false,
    });
    const vTrack = stream.getVideoTracks()[0];
    // Detay odaklı kodlama: metin/arayüz paylaşırken netlik artar
    try { vTrack.contentHint = 'detail'; } catch (e) {}
    state.screenStream = stream;
    vTrack.addEventListener('ended', () => stopScreen());
    socket.emit('screen-start');
    for (const peerId of state.voicePCs.keys()) {
      if (!state.screenSendPCs.has(peerId)) {
        createPC(peerId, 'screen-send', stream.getTracks(), 'screen-recv');
      }
    }
    updateShareUI();
    renderVoiceGrid();
    renderScreenArea(); // kendi ekranını hemen göster
    toast('Ekran paylaşımı başladı — 60 FPS yüksek kalite');
  } catch (e) {
    toast('Ekran paylaşımı başlatılamadı');
  }
}

function stopScreen() {
  if (!state.screenStream) return;
  if (lbPeer === 'self') closeScreenLightbox();
  state.screenStream.getTracks().forEach((t) => t.stop());
  state.screenStream = null;
  for (const id of [...state.screenSendPCs.keys()]) closeScreenPC(id);
  socket.emit('screen-stop');
  updateShareUI();
  renderVoiceGrid();
  renderScreenArea();
}

function updateShareUI() {
  const btn = $('#share-btn');
  const sharing = !!state.screenStream;
  btn.innerHTML = `${ICON.share}<span>${sharing ? 'Paylaşımı Durdur' : 'Ekran Paylaş'}</span>`;
  btn.classList.toggle('active', sharing);
}

$('#mic-btn').onclick = toggleMic;
$('#cam-btn').onclick = toggleCamera;
$('#share-btn').onclick = toggleScreen;
$('#leave-btn').onclick = leaveVoice;
// Ayrıl butonunu doldur (ikonsuz boş kalmasın)
$('#leave-btn').innerHTML = `${ICON.leave}<span>Ses Kanalından Ayrıl</span>`;

/* ---- Mesaj arama ---- */
const searchBtn = $('#search-btn');
const searchInput = $('#search-input');
const searchPanel = $('#search-panel');
if (searchBtn) {
  searchBtn.onclick = () => {
    const box = document.querySelector('.top-search');
    box.classList.toggle('hidden');
    if (!box.classList.contains('hidden')) searchInput.focus();
    searchPanel.classList.add('hidden');
  };
  $('#search-close').onclick = () => {
    document.querySelector('.top-search').classList.add('hidden');
    searchPanel.classList.add('hidden');
  };
  searchInput.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    if (!state.textChannel) return;
    socket.emit('search', { channelId: state.textChannel, query: searchInput.value }, ({ results }) => {
      searchPanel.innerHTML = '';
      if (!results || !results.length) {
        searchPanel.innerHTML = '<div class="sr-item">Sonuç bulunamadı</div>';
      }
      for (const m of results) {
        const it = document.createElement('div');
        it.className = 'sr-item';
        it.innerHTML = `<div class="sr-name">${esc(m.user.name)} <span style="color:var(--muted);font-weight:400">${fmtTime(m.ts)}</span></div><div class="sr-text">${esc(String(m.text || '📎 medya').slice(0, 80))}</div>`;
        it.onclick = () => {
          searchPanel.classList.add('hidden');
          const el = document.querySelector(`.msg[data-mid="${m.id}"]`);
          if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('new-msg'); setTimeout(() => el.classList.remove('new-msg'), 2000); }
        };
        searchPanel.appendChild(it);
      }
      searchPanel.classList.remove('hidden');
    });
  });
}

/* ---- Sabitlenmiş mesajlar ---- */
$('#pins-btn').onclick = () => {
  if (!state.textChannel) return;
  socket.emit('chat-join', state.textChannel); // pin-list tetiklenir
  setTimeout(() => { $('#pin-modal').classList.remove('hidden'); }, 200);
};
$('#pin-close').onclick = () => $('#pin-modal').classList.add('hidden');
$('#pin-modal').addEventListener('click', (e) => { if (e.target === $('#pin-modal')) $('#pin-modal').classList.add('hidden'); });
socket.on('pin-list', ({ channelId, pins }) => {
  if (channelId !== state.textChannel) return;
  state.pins = pins || [];
  const list = $('#pin-list');
  list.innerHTML = '';
  if (!state.pins.length) {
    list.innerHTML = '<div class="pin-item" style="border:none">Sabitlenmiş mesaj yok</div>';
    return;
  }
  for (const p of state.pins) {
    const it = document.createElement('div');
    it.className = 'pin-item';
    it.innerHTML = `<b style="background:${esc(p.user.color)};color:#111;border-radius:6px;padding:1px 7px;font-size:11px">${esc(avatarOf(p.user))}</b><div><b>${esc(p.user.name)}</b> <span>${fmtTime(p.ts)}</span><br/>${esc(String(p.text || '📎 medya').slice(0, 100))}</div>`;
    list.appendChild(it);
  }
});

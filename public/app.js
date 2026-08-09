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

const COLORS = ['#ff725e', '#5865f2', '#3ba55d', '#faa61a', '#eb459e', '#00b0f4', '#9b59b6', '#23a55a'];

/* --- Tema: Koyu (gri-siyah) / Siyah (saf siyah) --- */
const THEMES = ['koyu', 'siyah'];
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
  $('#theme-btn').onclick = () => applyTheme(document.body.dataset.theme === 'siyah' ? 'koyu' : 'siyah');
}
initTheme();

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const initials = (name) => name.trim().split(/\s+/).map((w) => w[0] || '').join('').slice(0, 2).toUpperCase();
const fmtTime = (ts) => new Date(ts).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

/* --- İkonlar (satır içi SVG) --- */
const ICON = {
  hash: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9.5 3 7.5 21M16.5 3l-2 18M3.5 8.5h17M3.5 15.5h17"/></svg>',
  speaker: '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M11 5 6 9H3v6h3l5 4V5z" fill="currentColor"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18 6a8.5 8.5 0 0 1 0 12" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/></svg>',
  mic: '<svg viewBox="0 0 24 24" width="18" height="18"><rect x="9" y="2.5" width="6" height="11" rx="3" fill="currentColor"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3.5" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/></svg>',
  micOff: '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M3 3l18 18" stroke="#f23f43" stroke-width="2" stroke-linecap="round"/><rect x="9" y="2.5" width="6" height="11" rx="3" fill="currentColor"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3.5" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/></svg>',
  share: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="4" width="19" height="12.5" rx="2"/><path d="M8 21h8M12 16.5V21"/><path d="M10.5 9.5l4 2.5-4 2.5z" fill="currentColor" stroke="none"/></svg>',
  expand: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3"/></svg>',
  leave: '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.5 2.1L8 10a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.9.6 2.9.7a2 2 0 0 1 1.7 2z" fill="currentColor"/></svg>',
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
  pendingCands: new Map(),  // 'wireTipi:peerId' -> [candidate...] (yarışı önlemek için)
  audioEls: new Map(),   // peerId -> <audio>
  screens: new Map(),    // sharerId -> MediaStream (uzaktan gelen ekranlar)
  joined: false,
};

// Test/debug için dışarıdan erişim
window.__nexarc = state;

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
   GİRİŞ
   ============================================================ */
let chosenColor = COLORS[0];

function buildColorPicker() {
  const picker = $('#color-picker');
  picker.innerHTML = '';
  COLORS.forEach((c) => {
    const s = document.createElement('span');
    s.className = 'color-swatch' + (c === chosenColor ? ' sel' : '');
    s.style.background = c;
    s.onclick = () => { chosenColor = c; buildColorPicker(); };
    picker.appendChild(s);
  });
}

function doLogin() {
  const name = $('#login-name').value.trim() || 'Misafir';
  state.joined = true;
  socket.emit('join', { name, color: chosenColor });
}

$('#login-btn').onclick = doLogin;
$('#login-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });
$('#login-name').value = 'Misafir-' + Math.floor(10 + Math.random() * 89);
buildColorPicker();

/* ============================================================
   SOCKET OLAYLARI
   ============================================================ */
socket.on('connect', () => {
  setConn(true);
  if (state.joined) socket.emit('join', { name: state.self?.name || 'Misafir', color: state.self?.color || chosenColor });
});

socket.on('disconnect', () => setConn(false));

socket.on('init', ({ self, channels }) => {
  state.self = self;
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
    state.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    state.micOn = true;
  } catch (e) {
    state.localStream = null;
    toast('Mikrofon izni alınamadı — yalnızca dinleme modu');
  }
  updateMicUI();
  for (const occ of occupants) connectVoicePeer(occ);
  showVoiceView();
  renderChannels();
  renderMembers();
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

/* --- Sinyal --- */
socket.on('signal', ({ from, pcType, data }) => handleSignal(from, pcType, data));

/* ============================================================
   KANAL ARAYÜZÜ
   ============================================================ */
function renderChannels() {
  const texts = $('#text-channels');
  const voices = $('#voice-channels');
  texts.innerHTML = '';
  voices.innerHTML = '';

  for (const ch of state.channels) {
    if (ch.type === 'text') {
      const el = document.createElement('button');
      el.className = 'channel' + (state.textChannel === ch.id ? ' active' : '');
      el.innerHTML = `${ICON.hash}<span class="ch-name">${esc(ch.name)}</span>`;
      el.onclick = () => selectTextChannel(ch.id);
      texts.appendChild(el);
    } else {
      const el = document.createElement('button');
      const inChannel = state.voiceChannel === ch.id;
      el.className = 'channel' + (inChannel ? ' active' : '');
      const occ = [...state.users.values()].filter((u) => u.voiceChannel === ch.id);
      const dots = occ.length
        ? `<span class="occ-dots">${occ.map((u) => `<span class="occ-dot" style="background:${esc(u.color)}"></span>`).join('')}</span>`
        : '';
      el.innerHTML = `${ICON.speaker}<span class="ch-name">${esc(ch.name)}</span><span class="ch-occupants">${occ.length || ''}</span>${dots}`;
      el.onclick = () => (inChannel ? leaveVoice() : joinVoice(ch.id));
      voices.appendChild(el);
    }
  }
}

function renderMembers() {
  const box = $('#members');
  $('#members-title').textContent = `ÜYELER — ${state.users.size}`;
  box.innerHTML = '';
  for (const u of state.users.values()) {
    const el = document.createElement('div');
    el.className = 'member';
    const status = u.voiceChannel
      ? (state.channels.find((c) => c.id === u.voiceChannel)?.name || 'ses kanalında')
      : 'Çevrimdışı kanal';
    el.innerHTML = `
      <span class="avatar" style="background:${esc(u.color)}">${esc(initials(u.name))}<span class="presence"></span></span>
      <div class="member-info">
        <div class="member-name">${esc(u.name)}${u.id === state.self?.id ? ' <span style="color:var(--muted)">(sen)</span>' : ''}</div>
        <div class="member-status">${esc(status)}</div>
      </div>
      ${u.sharing ? `<span class="member-icon" title="Ekran paylaşıyor">${ICON.share}</span>` : ''}`;
    box.appendChild(el);
  }
}

function selectTextChannel(channelId) {
  state.textChannel = channelId;
  renderChannels();
  setTitle(state.channels.find((c) => c.id === channelId)?.name || '', '#');
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
  const el = document.createElement('div');
  el.className = 'msg';
  el.innerHTML = `
    <span class="avatar" style="background:${esc(msg.user.color)}">${esc(initials(msg.user.name))}</span>
    <div class="msg-body">
      <div class="msg-head"><span class="msg-name">${esc(msg.user.name)}</span><span class="msg-time">${fmtTime(msg.ts)}</span></div>
      <div class="msg-text">${esc(msg.text)}</div>
    </div>`;
  box.appendChild(el);
  if (scroll) box.scrollTop = box.scrollHeight;
}

$('#chat-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = $('#chat-input');
  const text = input.value.trim();
  if (!text || !state.textChannel) return;
  socket.emit('chat', { channelId: state.textChannel, text });
  input.value = '';
  input.focus();
});

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
    const el = document.createElement('div');
    el.className = 'voice-card' + (isSelf ? ' self' : '');
    const muteBadge = isSelf && !state.micOn
      ? `<span class="mute-badge">${ICON.micOff}</span>` : '';
    el.innerHTML = `
      <span class="avatar" style="background:${esc(u.color)}">${esc(initials(u.name))}${muteBadge}</span>
      <div class="vcard-name">${esc(u.name)}${isSelf ? ' <span style="color:var(--muted)">(sen)</span>' : ''}</div>
      <div class="vcard-status">${u.sharing ? '<span class="badge-share">Ekran Paylaşılıyor</span>' : (isSelf ? (state.micOn ? 'Mikrofon açık' : 'Mikrofon kapalı') : 'Ses kanalında')}</div>`;
    grid.appendChild(el);
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
  if (tracks.length) {
    const stream = makeStream(tracks);
    tracks.forEach((t) => pc.addTrack(t, stream));
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
    } else {
      state.screens.set(peerId, stream);
      renderScreenArea();
    }
  };

  pc.onnegotiationneeded = async () => {
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
    : (sendType === 'screen-send' ? state.screenSendPCs : state.screenRecvPCs);
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
    : (wireType === 'screen-send' ? state.screenRecvPCs : state.screenSendPCs)).get(from);
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
        : (wireType === 'screen-send' ? 'screen-recv' : 'screen-send');
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
  // Karşı taraf paylaşıyorsa ekranını al
  if (user.sharing) connectScreenReceiver(user.id);
  renderVoiceGrid();
}

function connectScreenReceiver(peerId) {
  if (state.screenRecvPCs.has(peerId)) return;
  createPC(peerId, 'screen-recv', [], 'screen-send');
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
  const el = state.audioEls.get(peerId);
  if (el) { el.srcObject = null; el.remove(); state.audioEls.delete(peerId); }
  state.pendingCands.delete('voice:' + peerId);
  state.pendingCands.delete('screen-send:' + peerId);
  state.pendingCands.delete('screen-recv:' + peerId);
}

/* ============================================================
   SES KANALI KONTROLLERİ
   ============================================================ */
function joinVoice(channelId) {
  state.wantedVoice = channelId;
  socket.emit('voice-join', { channelId });
}

function leaveVoice() {
  state.wantedVoice = null;
  socket.emit('voice-leave');
  for (const id of [...state.voicePCs.keys()]) removePeer(id);
  if (state.localStream) { state.localStream.getTracks().forEach((t) => t.stop()); state.localStream = null; }
  if (state.screenStream) stopScreen();
  state.voiceChannel = null;
  $('#voice-view').classList.add('hidden');
  if (state.textChannel) selectTextChannel(state.textChannel);
  renderChannels();
  renderMembers();
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
$('#share-btn').onclick = toggleScreen;
$('#leave-btn').onclick = leaveVoice;
ice;

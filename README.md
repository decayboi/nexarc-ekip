# 🧡 NEXARC EKİP — Ses & Ekran Paylaşımlı Ekip Uygulaması

Discord tarzı, **3 kişilik ekip** için özel olarak yazılmış uygulama:
sesli sohbet kanalları, **ekran paylaşımı**, metin kanalları ve üye listesi.
Tema: Nexarc kimliği (siyah + `#ff725e`).

## ✨ Özellikler

- 🔊 **Ses kanalları** — 3 kanal hazır: Genel Ses, Toplantı, Çalışma Odası
- 🖥️ **Ekran paylaşımı** — 60 FPS yüksek kalite, **paylaşan kendi ekranını
  da görür**, izleyenler **büyütüp yakınlaştırabilir** (lightbox + zoom),
  aynı anda **birden fazla kişi** paylaşabilir (kartlar yan yana)
- 💬 **Metin kanalları** — genel, tasarım akışı, duyurular (+ son 100 mesaj geçmişi)
- 📎 **Medya ekleme** — chat'e resim, video, ses ve dosya yükle (25 MB'a kadar);
  resimler satır içi, videolar/sesler oynatıcılı, diğerleri indirme çipi olarak görünür
- 👥 **Üye listesi** — kim hangi kanalda, kim ekran paylaşıyor
- 🎨 Kişisel renk seçimi, takma ad, mikrofona dokunmadan katılma (dinleme modu)
- 🌗 **İki tema:** Koyu (gri-siyah) ve Siyah (saf siyah) — giriş ekranından
  veya sağ üstteki ay ikonundan değiştirilir, seçim hatırlanır.
- 🔌 Bağlantı koparsa otomatik yeniden bağlanır
- 👤 **Hesap sistemi** — kayıt ol / giriş yap (şifreler hash'li, oturum
  token'lı); **profil özelleştirme**: görünen ad, renk, avatar emojisi;
  sayfa yenilense de oturum korunur; misafir girişi de hâlâ var
- 🗂️ **Kanal yönetimi** — metin ve ses kanalı **ekle/sil** (Discord gibi,
  grup başlıklarındaki + butonu; kanalın üzerine gelince ✕); silinen ses
  kanalındaki herkes otomatik çıkarılır
- 🗑️ **Mesaj silme** — kendi mesajının üzerine gelince çöp kutusu butonu
- 😊 **Emoji** — sohbet kutusundaki 😊 butonuyla emoji paleti (64 emoji, ツ dahil)
- ✏️ **Mesaj düzenleme** — kendi mesajının üzerine gelince kalem ikonu
- ❤️ **Emoji tepkileri** — her mesaja 👍 ❤️ 😂 gibi tepkiler, sayaçlı
- ↩️ **Alıntı (yanıt)** — bir mesaja cevap ver, alıntı önizlemesi görünsün
- ⌨️ **"Yazıyor..." göstergesi** — kanaldaki kişiler yazarken görünür
- 🔍 **Mesaj arama** — üst bardaki büyüteçle kanal içinde ara
- 📌 **Sabitlenmiş mesajlar** — önemli mesajları pinle, 📌 listesinde topla
- 🎙️ **Konuşan vurgusu** — ses seviyesine göre turuncu halka (Discord gibi)
- 📷 **Kamera** — ses kanalında kamera aç, diğerleri canlı görür
- 🔇 **Susturma** — kanaldaki birini tek tıkla sustur (kullanıcı kartından)
- 🎚️ **Ses seviyesi** — her kullanıcının sesini ayrı ayarla (kaydırıcı)
- 🎤 **Mikrofon seçimi** — profil penceresinden mikrofon cihazını seç
- 💌 **Özel mesaj (DM)** — üyeye tıklayıp "Mesaj Gönder" ile özel sohbet
- 🟢 **Durumlar** — Çevrimiçi / Boşta / Rahatsız etmeyin (profilden)
- 🃏 **Kullanıcı kartı** — üyeye tıklayınca profil, DM ve susturma
- 🛡️ **Roller** — ilk kayıt olan kullanıcı Admin rozeti alır

## 🚀 Çalıştırma

```bash
npm install
npm start
```

Sunucu `http://localhost:3000` adresinde açar. 3 kişi aynı adresi 3 ayrı
sekmede/tarayıcıda/cihazda açarak kullanır.

## 📡 İnternetten kullanma (3 kişi farklı yerlerdeyse)

### Seçenek 1 — Ücretsiz bulut (önerilen): Render
1. Projeyi bir GitHub reposuna yükleyin.
2. [render.com](https://render.com) → **New Web Service** → repoyu seçin.
3. Build: `npm install` · Start: `node server.js` (Dockerfile'ı da kullanabilirsiniz).
4. Render size otomatik **HTTPS linki** verir (mikrofon/ekran için HTTPS şart).
5. Linki 2 arkadaşınıza gönderin — hepsi katılsın, kanalı açın.

Alternatifler: Railway, Fly.io, Vercel (Node), veya herhangi bir VPS.

### Seçenek 2 — Kendi sunucunuz (VPS)
```bash
apt install nodejs npm
git clone <repo> && cd nexarc-app
npm install && npm start
```
Nginx + Let's Encrypt ile HTTPS eklerseniz her şey çalışır.

### Seçenek 3 — Yerel ağ (aynı ofis)
`npm start` → `http://SUNUCU_IP:3000` yazın. Ancak tarayıcılar **HTTPS olmayan**
adreslerde mikrofon/ekran iznini engeller (`localhost` hariç). Çözümler:
- Chrome'da: `chrome://flags/#unsafely-treat-insecure-origin-as-secure` → IP'yi
  ekleyin (geliştirme için), veya
- Self-signed sertifika (mkcert) ile `HTTPS=1 npm start` benzeri bir ayar.

## ⚙️ Yapılandırma

**Kanalları değiştirmek:** `server.js` içindeki `CHANNELS` dizisini düzenleyin:
```js
{ id: 'ses-yeni', name: 'Yeni Oda', type: 'voice' }   // ses kanalı
{ id: 'metin-yeni', name: 'yeni-metin', type: 'text' } // metin kanalı
```

**TURN sunucusu eklemek (ağ çok katıysa):** `public/app.js` içindeki `ICE`
listesine ekleyin:
```js
{ urls: 'turn:SUNUCU:3478', username: 'kullanici', credential: 'sifre' }
```
(coturn kurabilir veya ücretli/ücretsiz TURN sağlayıcısı kullanabilirsiniz.)

## 🧠 Mimari

- **Sinyal:** Socket.IO (kanal yönetimi + WebRTC sinyalleri)
- **Ses/Ekran:** WebRTC **mesh** — 3 kişi için ideal (aracı sunucu yok, düşük gecikme).
  4+ kişiye çıkılacaksa SFU (LiveKit / mediasoup) gerektirir.
- **Sunucu durumu:** bellek içi (restart'ta sıfırlanır) — 3 kişilik ekip için yeterli.

## 🧪 Test

İki seviyede otomatik test gelir:

**1) Socket düzeyi (hızlı, tarayıcı gerektirmez):**
```bash
npm install -D socket.io-client   # bir kez
npm test
```
Giriş, üye yayını, metin sohbeti, ses kanalı, sinyal iletimi, ekran
paylaşımı ve kopma bildirimini 3 sanal istemciyle uçtan uca sınar.

**2) Gerçek tarayıcı (Puppeteer + sahte mikrofon):**
```bash
cd test/e2e && npm install   # bir kez (Chromium indirir)
npm run test:e2e             # veya: cd test/e2e && node browser-test.js
```
3 ayrı gerçek Chrome sayfası açar, ses kanalına sokar ve **gerçek WebRTC
ses/video bağlantılarının `connected` olduğunu** doğrular: mesh bağlantılar,
sohbet yayını, mikrofon kapat/aç, ekran paylaşımı ve kanaldan çıkış.

## 📁 Dosyalar

```
nexarc-app/
├── server.js          # Sunucu: Socket.IO sinyali + statik dosyalar
├── public/
│   ├── index.html     # Arayüz
│   ├── style.css      # Tema (siyah + #ff725e)
│   ├── app.js         # WebRTC istemcisi
│   └── fonts/         # Space Grotesk
├── Dockerfile         # Konteyner ile dağıtım
└── package.json
```

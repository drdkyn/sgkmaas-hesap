# SGK Emeklilik & Maaş Hesaplama

SGK Hizmet Dökümüne göre **emeklilik şartlarını** ve **bağlanacak maaşı** hesaplayan web uygulaması.
Hesaplama motoru, 78 sayfalık profesyonel SGK "Mükteza" Excel dosyasındaki tüm formüllerin
birebir TypeScript/JS karşılığıdır (Excel ile birebir doğrulandı — örnek: maaş 3.252,71 ₺).

## Mimari
- **Motor** (`lib/engine.mjs`): Excel'in tüm formül grafiğini (`data/workbook.json`, ~643k hücre)
  hücre-hassas, tembel (lazy) değerlendirme + sabit-nokta iterasyonu ile çalıştırır.
  `fast-formula-parser` üzerine kurulu; eksik fonksiyonlar, dizi formülleri, Türkçe sayı/tarih
  semantiği, boş-hücre kuralları ve döngü çözümü elle eklenmiştir.
- **Ayrıştırıcı** (`lib/parse-hizmet.mjs`): Yapıştırılan/PDF'ten çıkarılan Hizmet Dökümünü
  anlamsal olarak satırlara çevirir (Dönem, Belge Türü, Gün, matrah, tarihler).
- **Sarmalayıcı** (`lib/sgk.mjs`): `hesapla(inputs)` → temiz sonuç; global parametre override katmanı.
- **Arayüz** (`app/`): yapıştırma + PDF yükleme + sonuç sayfası; `app/admin` parametre yönetimi.

## Çalıştırma
```bash
npm install
npm run build && npm run start   # http://localhost:3000
# veya geliştirme: npm run dev
```
> Not: motor ~643k hücreyi değerlendirdiği için bir hesaplama ~20-30 sn sürebilir (iyileştirme planlı).

## Sayfalar
- `/` — Hizmet Dökümü yapıştır / PDF yükle → hesapla → sade sonuç.
- `/admin` — periyodik parametreleri (güncelleme/TÜFE katsayıları, yıl katsayıları) güncelle.

## Önemli dosyalar
- `data/workbook.json` — Excel'in çıkarılmış tam formül+veri grafiği (motorun çekirdeği).
- `data/params.json` — admin tarafından girilen özel parametre değerleri (cell override).
- `data/params-catalog.json` — admin panelinde gösterilen parametre kataloğu.

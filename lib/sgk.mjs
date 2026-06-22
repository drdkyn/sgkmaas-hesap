// App-facing wrapper: loads the workbook once (singleton) and exposes hesapla() which
// applies user inputs, solves the calc chain, and returns a clean, simple result object.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createEngine } from './engine.mjs';
import { toSerial } from './parse-hizmet.mjs';

const HIZ_COLS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P'];
const HIZ_FIRST = 10, HIZ_LAST = 810; // formulas extend to 810; clear all, then fill

// ---- Statü kontrolü (2829 S.K.) — hangi sigortalılık statüsünden emekli olunacağı ----
// Kural (kullanıcı/SGK): 01.10.2008'den (5510 yürürlük) ÖNCE ilk işe girenlerde SON 7 YIL
// hizmet dağılımı, SONRA girenlerde ise EN ÇOK hizmetin geçtiği statü esas alınır.
// Excel'in dağıtım hücreleri (Statü Tespiti) karmaşık ve 4c'de hatalı; aynı mantık burada
// ayrıştırılmış satırlardan deterministik hesaplanır.
const CUTOFF = toSerial('01.10.2008');
function statuAdi(A) {
  const a = String(A || '').toLowerCase().replace(/[()*]/g, '').trim();
  if (a === '4a') return '4a (SSK)';
  if (a === '4b') return '4b (Bağ-Kur)';
  if (a === '4c') return '4c (Emekli Sandığı)';
  return null;
}
function donemSerial(h) {
  const m = /(\d{4})[\/.](\d{1,2})/.exec(String(h || ''));
  return m ? toSerial('15.' + String(m[2]).padStart(2, '0') + '.' + m[1]) : null;
}
export function statuKontrol(rows, tahsisSerial, iseGirisSerial) {
  if (!Array.isArray(rows) || !rows.length) return null;
  const total = {};
  let ilkGiris = Infinity;
  const recs = [];     // determinasyon için: {kod, gun, ds}
  const tahsis = (typeof tahsisSerial === 'number' && tahsisSerial > 0) ? tahsisSerial : null;
  for (const r of rows) {
    const kod = statuAdi(r.A); if (!kod) continue;
    const gun = (r.J === 'İptal' ? -1 : 1) * (Number(r.K) || 0);
    total[kod] = (total[kod] || 0) + gun;
    const gs = (typeof r.M === 'number') ? r.M : donemSerial(r.H);
    if (typeof gs === 'number' && gs < ilkGiris) ilkGiris = gs;
    recs.push({ kod, gun, ds: donemSerial(r.H) });
  }
  // İşe giriş ELLE girildiyse (zorunlu alan) ilk giriş onu esas alır — statü/şart rejimi (01.10.2008
  // öncesi/sonrası) buna bağlı; dökümden türetilen tarih güvenilmez olabilir.
  if (typeof iseGirisSerial === 'number' && iseGirisSerial > 0) ilkGiris = iseGirisSerial;
  // SON 7 YIL = en yeni 2520 günlük FİİLİ HİZMET (takvim değil, kayıt bazlı — SGK/Excel yöntemi)
  const win = {};
  let acc = 0;
  for (const r of [...recs].filter(r => r.ds != null).sort((a, b) => b.ds - a.ds)) {
    if (acc >= 2520) break;
    let g = r.gun;
    if (g > 0 && acc + g > 2520) g = 2520 - acc;          // pencere sınırında kırp
    win[r.kod] = (win[r.kod] || 0) + g;
    if (g > 0) acc += g;
  }
  const ilkOnce = (ilkGiris !== Infinity && ilkGiris < CUTOFF);
  const sonYedi = ilkOnce && tahsis;                     // determinasyon son-7-yıl penceresine mi bakıyor
  const basis = sonYedi ? win : total;
  // 4a/4b/4c için belirleyici (determinasyon) ve toplam günleri her zaman göster
  const STATU = ['4a (SSK)', '4b (Bağ-Kur)', '4c (Emekli Sandığı)'];
  const statuler = STATU.map(ad => ({ ad, belirleyici: basis[ad] || 0, toplam: total[ad] || 0 }));
  const sorted = [...statuler].sort((a, b) => b.belirleyici - a.belirleyici);
  const belirlenen = sorted[0].belirleyici > 0 ? sorted[0].ad : null;
  // ANA STATÜ HEP 4a (SSK): "statünün 4a olması için ne kadar gün gerekir" hesaplanır.
  // Belirlenen zaten 4a ise mesaj yok. Eşik:
  //  - Son 7 yıl: pencere SABİT (acc≈2520, sıfır-toplam) -> çoğunluk için floor(pencere/2)+1.
  //  - Toplam: günler bağımsız -> kazananı geçmek için kazanan+1.
  const HEDEF = '4a (SSK)';
  const dortA = statuler.find(s => s.ad === HEDEF) || { belirleyici: 0, toplam: 0 };
  // SSK'nın belirleyici statü olması için ÇOĞUNLUK eşiği = ilgili tabanın yarısı + 1.
  //  - Son 7 yıl (01.10.2008 öncesi giriş): taban = 2520 günlük pencere → floor(acc/2)+1.
  //  - En çok hizmet (01.10.2008 sonrası giriş): taban = TOPLAM hizmet → floor(toplam/2)+1.
  const toplamTumStatu = STATU.reduce((s, ad) => s + (total[ad] || 0), 0);
  const esik = sonYedi ? (Math.floor(acc / 2) + 1) : (Math.floor(toplamTumStatu / 2) + 1);
  const gerekenDaha = (belirlenen && belirlenen !== HEDEF) ? Math.max(0, esik - dortA.belirleyici) : 0;
  return {
    belirlenen,
    kural: sonYedi ? 'Son 7 yıl hizmet dağılımı (01.10.2008 öncesi ilk giriş)' : 'En çok hizmet (01.10.2008 sonrası ilk giriş)',
    basisAd: sonYedi ? 'Son 7 Yıl' : 'Toplam',
    statuler, hedefAd: HEDEF, hedefMevcut: dortA.belirleyici, esik, gerekenDaha,
  };
}

// İşyeri-duyarlı çakışan hizmet: aynı ay içinde her işyeri kendi içinde 30 günle sınırlı (ücret
// bölünmesi → ay kapaması, çakışma değil). Birden çok işyeri varsa ve toplam (işyeri-kapalı) > 30
// ise, 30'u aşan kısım gerçek ÇAKIŞAN hizmettir. İptal kayıtları gününü düşer.
export function cakismaCross(rows) {
  if (!Array.isArray(rows)) return { cakisan: 0, detay: [] };
  const byMonth = {};
  for (const r of rows) {
    if (!statuAdi(r.A)) continue;                       // sadece 4a/4b/4c (prim ödenen)
    const m = String(r.H || '');
    if (!/\d{4}[\/.]\d{1,2}/.test(m)) continue;
    const emp = String(r._isyeri || '?');
    const gun = (r.J === 'İptal' ? -1 : 1) * (Number(r.K) || 0);
    (byMonth[m] || (byMonth[m] = {}));
    byMonth[m][emp] = (byMonth[m][emp] || 0) + gun;
  }
  let cakisan = 0; const detay = [];
  for (const [m, emps] of Object.entries(byMonth)) {
    let sumCapped = 0, empCount = 0;
    for (const g of Object.values(emps)) if (g > 0) { sumCapped += Math.min(g, 30); empCount++; }
    const excess = sumCapped - 30;
    if (excess > 0 && empCount > 1) { cakisan += excess; detay.push({ donem: m, gun: -excess }); }
  }
  detay.sort((a, b) => a.donem.localeCompare(b.donem));
  return { cakisan, detay };
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WB_PATH = path.join(__dirname, '..', 'data', 'workbook.json');
const PARAMS_PATH = path.join(__dirname, '..', 'data', 'params.json');

// Global, admin-editable parameters (güncelleme katsayısı, asgari ücret, …) stored as
// cell overrides "Sheet!Coord" -> value. Applied to EVERY calculation. Reloaded each call.
export function loadParams() {
  try { return JSON.parse(fs.readFileSync(PARAMS_PATH, 'utf8')); } catch { return {}; }
}
export function saveParams(obj) {
  fs.writeFileSync(PARAMS_PATH, JSON.stringify(obj, null, 2), 'utf8');
}

let _engine = null;
function engine() {
  if (!_engine) {
    const book = JSON.parse(fs.readFileSync(WB_PATH, 'utf8'));
    _engine = createEngine(book, {});
  }
  return _engine;
}

// MOTOR: MÜKTEZA 2026 (re-extract). Girdi yapısı eski 2023 dosyasından farklı:
// - Hizmet satırları yine 'Hiz. Dökümü'!A10:P810 (motorun SUMIF'leri bunu kullanır) — değer olarak doldurulur.
//   (Yeni dosyanın "Hizmet" sayfasındaki KONUMSAL/VLOOKUP iç-ayrıştırması KULLANILMAZ; bizim semantic
//    parse-hizmet.mjs PDF/yapıştırma/SGK-ekran varyasyonlarını çözüp yapılandırılmış satır verir.)
// - Kişi alanları "Hizmet" sayfasının parse edilen AA sütununda; doğrudan ezilir.
const INPUT_MAP = {
  dogumTarihi: 'Hizmet!AA11',          // serial
  cinsiyet: 'Hizmet!AA9',              // "Erkek"/"Kadın" (gelen "E"/"K" çevrilir)
  iseGirisTarihi: 'Hizmet!AA38',       // serial — işe ilk giriş (ZORUNLU; statü/şart rejimini belirler)
  tahsisTarihi: 'Bilgi Formu (Y)!H29', // serial (Emek.Hes!DA5 buradan okur)
};

// Output cells -> friendly result (MÜKTEZA 2026 düzeni).
const OUT = {
  adSoyad: 'Giriş!C2',
  tcKimlik: 'Giriş!C3',
  maasAylik: 'Emekli Maaşı!AU58',                 // bağlanan aylık
  maasEkOdeme: 'Emekli Maaşı!AU60',               // ek ödeme (%4/%5)
  maasToplam: 'Emekli Maaşı!AU62',                // aylık + ek ödeme
  tabanAylik: 'Emekli Maaşı!CZ1',                 // en düşük emekli aylığı (admin parametresi; hesaba karışmaz, bilgi)
  sigortalilikSuresi: 'Emek. Hes.!AV3',           // sigortalılık süresi (yıl)
  // primGunSayisi + toplamGun + çakışan aşağıda hesaplanır (PÖGS = Giriş!N6, çakışan = işyeri-duyarlı JS).
};

function v(eng, ref) { eng.reset === undefined; return eng.get(ref); }

export function hesapla(inputs = {}) {
  const eng = engine();
  eng.reset();

  // 0) Global admin parameters (override workbook's embedded periodic values).
  const params = loadParams();
  for (const [ref, val] of Object.entries(params)) {
    if (val !== undefined && val !== null && val !== '') eng.setInput(ref, typeof val === 'string' && /^-?\d+(\.\d+)?$/.test(val.trim()) ? Number(val) : val);
  }

  // 1) Hizmet Dökümü rows -> 'Hiz. Dökümü'!A10:P810 (clear all first, then fill).
  const rows = inputs.hizmetRows;
  if (Array.isArray(rows) && rows.length) {
    for (let r = HIZ_FIRST; r <= HIZ_LAST; r++)
      for (const c of HIZ_COLS) eng.setInput(`Hiz. Dökümü!${c}${r}`, '');
    // Adı Soyadı (D) must be non-empty or the engine drops the row from PÖGS. The döküm is for
    // one person, so backfill any missing D with the supplied name.
    const adSoyad = inputs.adSoyad || 'SİGORTALI';
    rows.forEach((row, i) => {
      const r = HIZ_FIRST + i;
      if (row.D === undefined || row.D === '') row.D = adSoyad;
      for (const c of HIZ_COLS) if (row[c] !== undefined && row[c] !== '') eng.setInput(`Hiz. Dökümü!${c}${r}`, row[c]);
    });
  }

  // 2) Person / tahsis fields. Dates may arrive as dd.mm.yyyy -> serial. Cinsiyet E/K -> Erkek/Kadın.
  const dateKeys = new Set(['dogumTarihi', 'tahsisTarihi', 'iseGirisTarihi']);
  for (const [k, ref] of Object.entries(INPUT_MAP)) {
    let val = inputs[k];
    if (val === undefined || val === null || val === '') continue;
    if (dateKeys.has(k)) val = toSerial(val);
    if (k === 'cinsiyet') val = (String(val).toUpperCase().startsWith('K')) ? 'Kadın' : 'Erkek';
    eng.setInput(ref, val);
  }
  // solve the principal output (toplam = aylık + ek ödeme; drives the whole chain + cycle iteration)
  const maas = eng.solve('Emekli Maaşı!AU62');
  const result = { iters: maas.iters };
  for (const [k, ref] of Object.entries(OUT)) result[k] = eng.get(ref);
  // Kimlik GÖSTERİMİ motordan DEĞİL girdiden/parse'tan alınır: workbook.json'dan kişisel veri
  // (ad/TC) temizlendiği için Giriş!C2/C3 boştur; ayrıca gömülü örnek kişinin sızmaması için.
  const _adFromRows = (Array.isArray(rows) && rows.length) ? String(rows.find(r => r.D)?.D || '').replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s+/g, ' ').trim() : '';
  result.adSoyad = inputs.adSoyad || _adFromRows || '';
  result.tcKimlik = inputs.tcKimlik || '';
  // eligibility scenarios — MÜKTEZA 2026 'Emeklilik Şartları' r7..13: A=ad, G=gün, H=süre, J=sonuç.
  // (Yeni dosya yaşı ayrı sütunda göstermiyor — EYT sonrası birçok durumda yaş şartı yok.)
  const senaryolar = [];
  for (let r = 7; r <= 13; r++) {
    const ad = eng.get(`Emeklilik Şartları!A${r}`);
    if (ad == null || ad === '' || ad === 0) continue;
    senaryolar.push({
      ad: String(ad),
      sure: eng.get(`Emeklilik Şartları!H${r}`),
      yas: '',
      gun: eng.get(`Emeklilik Şartları!G${r}`),
      sonuc: String(eng.get(`Emeklilik Şartları!J${r}`) ?? ''),
    });
  }
  // Prim gün: DÖKÜMDE GÖSTERİLEN günler (net: Asıl/Ek +, İptal -) = toplam PÖGS. Çakışma İŞYERİ-DUYARLI
  // hesaplanır (çıkış TARİHİ hesabı YAPILMAZ): aynı ay AYNI işyeri >30 = ücret bölünmesi (sayılmaz);
  // FARKLI işyerlerinden gelen ay-aşımı = çakışan hizmet (düşülür). İbrahim: 5732 → çakışan 2 → 5730.
  const cc = (Array.isArray(inputs.hizmetRows) && inputs.hizmetRows.length) ? cakismaCross(inputs.hizmetRows) : { cakisan: 0, detay: [] };
  let pogs = 0;
  if (Array.isArray(inputs.hizmetRows) && inputs.hizmetRows.length) {
    for (const r of inputs.hizmetRows) {
      if (!statuAdi(r.A)) continue;
      pogs += (r.J === 'İptal' ? -1 : 1) * (Number(r.K) || 0);
    }
  } else {
    pogs = Number(eng.get('Giriş!N6')) || 0;   // seed/embedded
  }
  result.toplamGun = pogs;
  result.cakisanHizmet = -cc.cakisan;
  result.cakisanDetay = cc.detay;
  result.primGunSayisi = pogs - cc.cakisan;   // net (gösterilen günler − işyeri çakışması)

  // Statü kontrolü (hangi sigortalılık statüsünden emekli olunacağı)
  result.statu = statuKontrol(inputs.hizmetRows, toSerial(inputs.tahsisTarihi), toSerial(inputs.iseGirisTarihi));

  result.senaryolar = senaryolar;
  // Privacy: wipe the person's identity/service data from the engine right after the result is
  // built. reset() clears overrides (TC/ad/sicil/hizmet satırları) + cache + cycle state, so no
  // personal data lingers in the singleton between requests.
  eng.reset();
  return result;
}

export function _engineRef() { return engine(); }

// Read a cell's stored (default) value from the workbook — used by the admin panel.
export function readCell(ref) {
  const eng = engine();
  const i = ref.lastIndexOf('!'); const sh = ref.slice(0, i), co = ref.slice(i + 1);
  const cell = eng.book.sheets[sh] && eng.book.sheets[sh].cells[co];
  let v = cell ? cell.v : null;
  if (v && typeof v === 'object' && 'd' in v) v = v.d;
  return v == null ? '' : v;
}

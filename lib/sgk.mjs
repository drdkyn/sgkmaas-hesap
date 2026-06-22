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
export function statuKontrol(rows, tahsisSerial) {
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
  const ikinci = sorted[1];
  const fark = sorted[0].belirleyici - (ikinci ? ikinci.belirleyici : 0);  // önde olma farkı (= rakibin kapatması gereken gün)
  return {
    belirlenen,
    kural: sonYedi ? 'Son 7 yıl hizmet dağılımı (01.10.2008 öncesi ilk giriş)' : 'En çok hizmet (01.10.2008 sonrası ilk giriş)',
    basisAd: sonYedi ? 'Son 7 Yıl' : 'Toplam',
    statuler, fark, ikinciAd: ikinci ? ikinci.ad : null,
  };
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

// Input cells (where user data lands). The pasted Hizmet Dökümü goes into the "Giriş." sheet
// (A2..) just like the Excel macro; individual fields map to specific Giriş. cells.
const INPUT_MAP = {
  adSoyad: 'Giriş.!C2',
  tcKimlik: 'Giriş.!C3',
  dogumTarihi: 'Giriş.!C8',     // serial
  cinsiyet: 'Giriş.!E100',      // "E"/"K"
  // NOT: işe giriş ELLE girilmez — motor Hiz.Dökümü'nden türetiyor (Giriş!L12/L13).
  // Eski iseGiris→'Giriş.!N4' eşlemesi yanlıştı (N4 sicil hücresi), kaldırıldı.
  tahsisTarihi: 'Giriş.!H99',   // serial
};

// Output cells -> friendly result. Pulled from the visible "Giriş" dashboard + calc sheets.
const OUT = {
  adSoyad: 'Giriş!L6',
  tcKimlik: 'Giriş!L7',
  maasAylik: 'Emekli Maaşı!AR50',
  maasEkOdeme: 'Emekli Maaşı!AR52',
  maasToplam: 'Emekli Maaşı!AR54',
  primGunSayisi: 'Emeklilik Şartları!J14',     // MEVCUT DURUM satırı: mevcut prim ödeme gün
  sigortalilikSuresi: 'Emeklilik Şartları!K14', // MEVCUT DURUM satırı: kişinin gerçek sigortalılık süresi (yıl). (K8 senaryo GEREKSİNİMİ idi, yanlıştı.)
  // NOT: çakışan hizmet = SUM(Hiz.Dökümü!AZ). Kontrol!C12 bunu AZ:AZ (tüm sütun, ~1M satır) ile
  // yapar ve ~100s sürer; bunun yerine hesapla() AZ10:AZ810 kullanılan aralığını toplar.
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

  // 2) Person / tahsis fields. Dates may arrive as dd.mm.yyyy -> serial.
  const dateKeys = new Set(['dogumTarihi', 'tahsisTarihi']);
  for (const [k, ref] of Object.entries(INPUT_MAP)) {
    let val = inputs[k];
    if (val === undefined || val === null || val === '') continue;
    if (dateKeys.has(k)) val = toSerial(val);
    eng.setInput(ref, val);
  }
  // solve the principal output (drives the whole chain + cycle iteration), then read others
  const maas = eng.solve(OUT.maasAylik);
  const result = { maasAylik: maas.value, iters: maas.iters };
  for (const [k, ref] of Object.entries(OUT)) {
    if (k === 'maasAylik') continue;
    result[k] = eng.get(ref);
  }
  // eligibility scenarios from the Giriş dashboard (rows 23-29): name / süre / yaş / gün / sonuç
  const senaryolar = [];
  for (let r = 23; r <= 29; r++) {
    const ad = eng.get(`Giriş!B${r}`);
    if (ad == null || ad === '' || ad === 0) continue;
    senaryolar.push({
      ad: String(ad),
      sure: eng.get(`Giriş!L${r}`),
      yas: eng.get(`Giriş!P${r}`),
      gun: eng.get(`Giriş!T${r}`),
      sonuc: String(eng.get(`Giriş!X${r}`) ?? ''),
    });
  }
  // Çakışan hizmet (aynı aya denk gelip düşülen gün) = SUM(Hiz.Dökümü!AZ). Sadece kullanılan
  // aralığı topla (AZ10:AZ810, AR50 ile zaten hesaplandı → anında); AZ:AZ tüm sütunu okumak ~100s.
  let cak = 0; const cakisanDetay = [];
  for (let r = HIZ_FIRST; r <= HIZ_LAST; r++) {
    const az = eng.get(`Hiz. Dökümü!AZ${r}`);
    if (typeof az === 'number' && az < 0) {
      cak += az;
      cakisanDetay.push({ donem: String(eng.get(`Hiz. Dökümü!H${r}`) ?? ''), gun: az });
    }
  }
  result.cakisanHizmet = cak;
  result.cakisanDetay = cakisanDetay;   // hangi dönemlerde kaç gün çakışma düşüldü

  // Statü kontrolü (hangi sigortalılık statüsünden emekli olunacağı)
  result.statu = statuKontrol(inputs.hizmetRows, toSerial(inputs.tahsisTarihi));

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

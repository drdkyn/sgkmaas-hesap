// App-facing wrapper: loads the workbook once (singleton) and exposes hesapla() which
// applies user inputs, solves the calc chain, and returns a clean, simple result object.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createEngine } from './engine.mjs';
import { toSerial } from './parse-hizmet.mjs';

const HIZ_COLS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P'];
const HIZ_FIRST = 10, HIZ_LAST = 810; // formulas extend to 810; clear all, then fill

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
  iseGiris: 'Giriş.!N4',
  tahsisTarihi: 'Giriş.!H99',   // serial
};

// Output cells -> friendly result. Pulled from the visible "Giriş" dashboard + calc sheets.
const OUT = {
  adSoyad: 'Giriş!L6',
  tcKimlik: 'Giriş!L7',
  maasAylik: 'Emekli Maaşı!AR50',
  maasEkOdeme: 'Emekli Maaşı!AR52',
  maasToplam: 'Emekli Maaşı!AR54',
  primGunSayisi: 'Emeklilik Şartları!J14',     // mevcut prim ödeme gün
  sigortalilikSuresi: 'Emeklilik Şartları!K8',
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
  result.senaryolar = senaryolar;
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

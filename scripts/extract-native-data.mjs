#!/usr/bin/env node
/**
 * workbook.json'dan native modüller için statik tabloları çıkarır.
 * Çalıştır: node scripts/extract-native-data.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const WB_PATH = path.join(ROOT, 'data', 'workbook.json');
const OUT_DIR = path.join(ROOT, 'data', 'native');
const OUT_PATH = path.join(OUT_DIR, 'tables.json');

function decode(v) {
  if (v && typeof v === 'object' && 'd' in v) return v.d;
  return v === undefined ? null : v;
}

function cellVal(sh, coord) {
  const c = sh?.cells?.[coord];
  return c ? decode(c.v) : null;
}

const wb = JSON.parse(fs.readFileSync(WB_PATH, 'utf8'));
const veri = wb.sheets['Veri Girişi'];
const emek = wb.sheets['Emek. Hes.'];
const gosterge = wb.sheets['Gösterge Tabl.'];
const emektar = wb.sheets['Emektar 4a (Y)'];

const tufe = {};
const gh = {};
const cola = {};
const pekTavan = { ozel: {}, kamu: {} };
const enDusuk = {};

for (let r = 4; r <= 18; r++) {
  const yil = cellVal(veri, 'E' + r) || cellVal(veri, 'D' + r);
  if (!yil) continue;
  const y = String(Math.round(yil));
  const f = cellVal(veri, 'F' + r);
  const g = cellVal(veri, 'G' + r);
  const n = cellVal(veri, 'N' + r);
  const u = cellVal(veri, 'U' + r);
  const v = cellVal(veri, 'V' + r);
  const yy = cellVal(veri, 'Y' + r);
  if (f != null) tufe[y] = f;
  if (g != null) gh[y] = g;
  if (n != null) cola[y] = n;
  if (u != null) pekTavan.ozel[y] = u;
  if (v != null) pekTavan.kamu[y] = v;
  if (yy != null) enDusuk[y] = yy;
}

// Emeklilik şartları senaryo anahtarları (AR256-262 → tablo satırı)
const senaryoKeys = [];
for (let r = 256; r <= 262; r++) {
  senaryoKeys.push({ row: r, key: cellVal(emek, 'AR' + r) });
}

// Emek. Hes. uygunluk tablosu (AQ12:BG242) — özet
const uygunlukTablosu = [];
for (let r = 12; r <= 242; r++) {
  const aq = cellVal(emek, 'AQ' + r);
  if (aq == null && !emek.cells['AQ' + r]?.f) continue;
  uygunlukTablosu.push({
    row: r,
    tip: cellVal(emek, 'A' + r),
    cinsiyet: cellVal(emek, 'B' + r),
    minGun: cellVal(emek, 'H' + r),
    maxGun: cellVal(emek, 'I' + r),
    minYas: decode(emek.cells['L' + r]?.v),
    maxYas: decode(emek.cells['M' + r]?.v),
    minSure: cellVal(emek, 'N' + r),
    kanun: cellVal(emek, 'Q' + r),
  });
}

// Gösterge tablosu (ilk 500 satır örnek — tam tablo büyük)
const gostergeOrnek = [];
if (gosterge) {
  for (let r = 2; r <= Math.min(502, 20000); r++) {
    const a = cellVal(gosterge, 'A' + r);
    if (a == null) break;
    gostergeOrnek.push({
      yil: a,
      gosterge: cellVal(gosterge, 'B' + r),
      katsayi: cellVal(gosterge, 'C' + r),
    });
  }
}

// Emektar 4a katsayıları (yıl bazlı)
const emektar4a = [];
if (emektar) {
  for (let r = 4; r <= 80; r++) {
    const yil = cellVal(emektar, 'A' + r);
    if (!yil) continue;
    emektar4a.push({
      yil,
      b: cellVal(emektar, 'B' + r),
      c: cellVal(emektar, 'C' + r),
      d: cellVal(emektar, 'D' + r),
    });
  }
}

const out = {
  extractedAt: new Date().toISOString(),
  source: 'MÜKTEZA 2026 workbook.json',
  veriGirisi: { tufe, gh, cola, pekTavan, enDusuk },
  senaryoKeys,
  uygunlukTablosu,
  gostergeSatirSayisi: gostergeOrnek.length,
  gostergeOrnek,
  emektar4a,
};

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2), 'utf8');
console.log('Wrote', OUT_PATH);
console.log('  TÜFE yılları:', Object.keys(tufe).length);
console.log('  Uygunluk satırları:', uygunlukTablosu.length);
console.log('  Gösterge örnek:', gostergeOrnek.length);
console.log('  Emektar 4a:', emektar4a.length);

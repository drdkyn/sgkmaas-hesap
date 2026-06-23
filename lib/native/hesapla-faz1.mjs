/**
 * Faz-1 hesaplama orkestratörü.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createEngine } from '../engine.mjs';
import { toSerial } from './excel-serial.mjs';
import { statuKontrol } from './statu.mjs';
import { cakismaCross } from './cakisma.mjs';
import { hesaplaPogs } from './pogs.mjs';
import { loadParams } from './params.mjs';
import { applyRowParams } from './admin-rows.mjs';
import { readSenaryolar, readSigortalilikSuresi } from './emeklilik.mjs';
import { hesaplaMaas } from './maas.mjs';
import {
  HIZ_DATA_FIRST,
  HIZ_INPUT_COLS,
  HIZ_SHEET,
  HIZ_SHEET_MAX_ROW,
  hizClearThroughRow,
  hizMaxRowForRowCount,
} from './hizmet-bounds.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WB_PATH = path.join(__dirname, '..', '..', 'data', 'workbook.json');

const INPUT_MAP = {
  dogumTarihi: 'Hizmet!AA11',
  cinsiyet: 'Hizmet!AA9',
  iseGirisTarihi: 'Hizmet!AA38',
  tahsisTarihi: 'Bilgi Formu (Y)!H29',
};

let _engine = null;
function engine() {
  if (!_engine) {
    const book = JSON.parse(fs.readFileSync(WB_PATH, 'utf8'));
    _engine = createEngine(book, { hizSheetMaxRow: HIZ_SHEET_MAX_ROW });
  }
  return _engine;
}

function applyParams(eng) {
  const params = loadParams();
  for (const [ref, val] of Object.entries(params)) {
    if (val === undefined || val === null || val === '') continue;
    eng.setInput(ref, typeof val === 'string' && /^-?\d+(\.\d+)?$/.test(val.trim()) ? Number(val) : val);
  }
  applyRowParams(eng);
}

function injectHizmetRows(eng, rows, adSoyad) {
  const clearTo = hizClearThroughRow(rows.length);
  for (let r = HIZ_DATA_FIRST; r <= clearTo; r++)
    for (const c of HIZ_INPUT_COLS) eng.setInput(`${HIZ_SHEET}!${c}${r}`, '');
  const name = adSoyad || 'SİGORTALI';
  rows.forEach((row, i) => {
    const r = HIZ_DATA_FIRST + i;
    if (r > HIZ_SHEET_MAX_ROW) return;
    if (row.D === undefined || row.D === '') row.D = name;
    for (const c of HIZ_INPUT_COLS) if (row[c] !== undefined && row[c] !== '') eng.setInput(`${HIZ_SHEET}!${c}${r}`, row[c]);
  });
}

function injectPerson(eng, inputs) {
  const dateKeys = new Set(['dogumTarihi', 'tahsisTarihi', 'iseGirisTarihi']);
  for (const [k, ref] of Object.entries(INPUT_MAP)) {
    let val = inputs[k];
    if (val === undefined || val === null || val === '') continue;
    if (dateKeys.has(k)) val = toSerial(val);
    if (k === 'cinsiyet') val = (String(val).toUpperCase().startsWith('K')) ? 'Kadın' : 'Erkek';
    eng.setInput(ref, val);
  }
}

export function hesaplaFaz1(inputs = {}) {
  const t0 = performance.now();
  const eng = engine();
  eng.reset();

  const rows = inputs.hizmetRows;
  const rowCount = Array.isArray(rows) ? rows.length : 0;
  if (rowCount > HIZ_SHEET_MAX_ROW - HIZ_DATA_FIRST + 1) {
    return {
      error: `Hizmet dökümü çok uzun (${rowCount} satır). Maksimum ${HIZ_SHEET_MAX_ROW - HIZ_DATA_FIRST + 1} kayıt desteklenir.`,
    };
  }
  if (rowCount > 0) eng.setMaxHizRow(hizMaxRowForRowCount(rowCount));

  applyParams(eng);
  if (rowCount) injectHizmetRows(eng, rows, inputs.adSoyad);
  injectPerson(eng, inputs);

  const maas = hesaplaMaas(eng);
  const result = {
    iters: maas.iters,
    engine: 'faz1',
    hizmetSatir: rowCount,
    hizMaxRow: rowCount > 0 ? hizMaxRowForRowCount(rowCount) : HIZ_SHEET_MAX_ROW,
    evaluated: eng.stats.evaluated,
    ms: Math.round(performance.now() - t0),
    maasAylik: maas.maasAylik,
    maasEkOdeme: maas.maasEkOdeme,
    maasToplam: maas.maasToplam,
    tabanAylik: maas.tabanAylik,
    sigortalilikSuresi: readSigortalilikSuresi(eng),
  };

  const _adFromRows = rowCount
    ? String(rows.find(r => r.D)?.D || '').replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s+/g, ' ').trim()
    : '';
  result.adSoyad = inputs.adSoyad || _adFromRows || '';
  result.tcKimlik = inputs.tcKimlik || '';

  const cc = rowCount ? cakismaCross(rows) : { cakisan: 0, detay: [] };
  const pogs = rowCount ? hesaplaPogs(rows) : (Number(eng.get('Giriş!N6')) || 0);

  result.toplamGun = pogs;
  result.cakisanHizmet = -cc.cakisan;
  result.cakisanDetay = cc.detay;
  result.primGunSayisi = pogs - cc.cakisan;
  result.statu = statuKontrol(rows, toSerial(inputs.tahsisTarihi), toSerial(inputs.iseGirisTarihi));
  result.senaryolar = readSenaryolar(eng);

  eng.reset();
  return result;
}

export { engine as _engineRef };

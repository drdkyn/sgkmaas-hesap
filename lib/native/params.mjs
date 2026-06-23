import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PARAMS_PATH = path.join(__dirname, '..', '..', 'data', 'params.json');
const TABLES_PATH = path.join(__dirname, '..', '..', 'data', 'native', 'tables.json');

let _tables = null;

export function loadParams() {
  try { return JSON.parse(fs.readFileSync(PARAMS_PATH, 'utf8')); } catch { return {}; }
}

export function saveParams(obj) {
  fs.writeFileSync(PARAMS_PATH, JSON.stringify(obj, null, 2), 'utf8');
}

export function loadTables() {
  if (_tables) return _tables;
  try {
    _tables = JSON.parse(fs.readFileSync(TABLES_PATH, 'utf8'));
  } catch {
    _tables = { veriGirisi: {}, emeklilikSenaryolari: [] };
  }
  return _tables;
}

/** Veri Girişi TÜFE/GH oranlarını ondalık çarpana çevir (örn. 64.77 → 0.6477). */
export function tufeCarpan(yil, tables) {
  const t = tables || loadTables();
  const v = t.veriGirisi?.tufe?.[String(yil)];
  return typeof v === 'number' ? v / 100 : null;
}

export function ghOran(yil, tables) {
  const t = tables || loadTables();
  const v = t.veriGirisi?.gh?.[String(yil)];
  return typeof v === 'number' ? v / 100 : null;
}

/** Post-2008 güncelleme çarpanı: 1 + TÜFE + GH×0.30 */
export function guncellemeCarpan(yil, tables) {
  const tufe = tufeCarpan(yil, tables);
  const gh = ghOran(yil, tables);
  if (tufe == null || gh == null) return 1;
  return 1 + tufe + gh * 0.3;
}

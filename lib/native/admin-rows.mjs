/**
 * Admin paneli — yıllık/dinamik parametre satırları.
 * Veri Girişi satırı N = yıl - 2014 (E4=2018); Emekli Maaşı H{yıl-2013} → F{N}.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROWS_PATH = path.join(__dirname, '..', '..', 'data', 'params-rows.json');

export const YEAR_ROW_BASE = 2014;
export const YEAR_ROW_MIN = 4;
export const YEAR_ROW_MAX = 30;

export function yearToRow(yil) {
  const y = Number(yil);
  if (!Number.isFinite(y)) return null;
  const row = y - YEAR_ROW_BASE;
  if (row < YEAR_ROW_MIN || row > YEAR_ROW_MAX) return null;
  return row;
}

export function cellRef(sheet, col, row) {
  return `${sheet}!${col}${row}`;
}

export function yearlyRefs(yil, col, deger) {
  const row = yearToRow(yil);
  if (!row) return null;
  return {
    [cellRef('Veri Girişi', 'E', row)]: Number(yil),
    [cellRef('Veri Girişi', col, row)]: deger,
  };
}

export function loadParamsRows() {
  try { return JSON.parse(fs.readFileSync(ROWS_PATH, 'utf8')); } catch { return { yearly: {}, custom: [] }; }
}

export function saveParamsRows(obj) {
  fs.writeFileSync(ROWS_PATH, JSON.stringify(obj, null, 2), 'utf8');
}

export function yearlyRowsToOverrides(rows = loadParamsRows()) {
  const out = {};
  for (const [col, byYear] of Object.entries(rows.yearly || {})) {
    for (const [yil, deger] of Object.entries(byYear || {})) {
      const refs = yearlyRefs(yil, col, deger);
      if (refs) Object.assign(out, refs);
    }
  }
  return out;
}

export function customRowsToOverrides(rows = loadParamsRows()) {
  const out = {};
  for (const item of rows.custom || []) {
    if (item.refs) Object.assign(out, item.refs);
  }
  return out;
}

export function allRowOverrides() {
  const rows = loadParamsRows();
  return { ...yearlyRowsToOverrides(rows), ...customRowsToOverrides(rows) };
}

export function applyRowParams(eng) {
  for (const [ref, val] of Object.entries(allRowOverrides())) {
    if (val !== undefined && val !== null && val !== '') eng.setInput(ref, val);
  }
}

export function mergeGroupWithYearlyExtras(grup, rows = loadParamsRows()) {
  if (!grup.rowSchema || grup.rowSchema.tip !== 'yearly') return grup;
  const col = grup.rowSchema.col;
  const byYear = rows.yearly?.[col] || {};
  const existingYears = new Set(
    grup.params.map(p => { const m = /(\d{4})/.exec(p.label || ''); return m ? +m[1] : null; }).filter(Boolean),
  );
  const extras = [];
  for (const [yil, deger] of Object.entries(byYear).sort((a, b) => +a[0] - +b[0])) {
    if (existingYears.has(+yil)) continue;
    const row = yearToRow(yil);
    if (!row) continue;
    extras.push({
      ref: cellRef('Veri Girişi', col, row),
      label: `${yil} ${grup.rowSchema.etiket || col}`,
      varsayilan: '',
      override: deger,
      dinamik: true,
      yil: +yil,
    });
  }
  return { ...grup, params: [...grup.params, ...extras] };
}

export function mergeGroupWithCustomExtras(grup, rows = loadParamsRows()) {
  if (!grup.rowSchema || grup.rowSchema.tip !== 'custom') return grup;
  const col = grup.rowSchema.col;
  const existingRefs = new Set(grup.params.map(p => p.ref));
  const extras = [];
  for (const item of rows.custom || []) {
    if (item.grupId !== grup.baslik) continue;
    for (const [ref, val] of Object.entries(item.refs || {})) {
      if (existingRefs.has(ref)) continue;
      extras.push({
        ref,
        label: item.label || ref,
        varsayilan: '',
        override: val,
        dinamik: true,
      });
    }
  }
  return { ...grup, params: [...grup.params, ...extras] };
}

export function nextFreeRow(col, usedRows, minRow = 4, maxRow = 25) {
  for (let r = minRow; r <= maxRow; r++) {
    if (!usedRows.has(r)) return r;
  }
  return null;
}

export function addYearlyRow(col, yil, deger) {
  const rows = loadParamsRows();
  if (!rows.yearly[col]) rows.yearly[col] = {};
  rows.yearly[col][String(yil)] = deger;
  saveParamsRows(rows);
  return yearlyRefs(yil, col, deger);
}

export function addCustomRow(grupId, label, refs) {
  const rows = loadParamsRows();
  if (!rows.custom) rows.custom = [];
  rows.custom.push({ grupId, label, refs });
  saveParamsRows(rows);
  return refs;
}

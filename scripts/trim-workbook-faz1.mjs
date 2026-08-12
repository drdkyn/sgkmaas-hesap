#!/usr/bin/env node
/**
 * workbook.json Faz-1 budama (gereksiz sayfaları çıkarır, yerinde günceller).
 * Yeni Excel çıkarmasından sonra çalıştırın: npm run trim-workbook
 *
 * Tam çıkarım dosyası için: node scripts/trim-workbook-faz1.mjs --in=path/to/full.json
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const WB_DEFAULT = path.join(ROOT, 'data', 'workbook.json');
const MANIFEST = path.join(ROOT, 'data', 'native', 'faz1-sheets.json');

export const HIZ_SHEET_MAX_ROW = 890;

const SEED_SHEETS = [
  'Emekli Maaşı', 'Emek. Hes.', 'Emeklilik Şartları', 'Hiz. Dökümü', 'Hizmet',
  'Giriş', 'Veri Girişi', 'Bilgi Formu (Y)', 'Gösterge Tabl.', 'Emektar 4a (Y)',
];

/** Regresyonla doğrulanmış minimum set (+ Hiz. Dökümü ayrı). */
const RUNTIME_SHEETS = [
  'Bilgi Formu (Y)', 'Borçln. (TL)', 'Emek. Hes.', 'Emekli Maaşı', 'Emeklilik Şartları',
  'Emektar 4a (Y)', 'Giriş', 'Gösterge Tabl.', 'Hizmet', 'Veri Girişi',
];

function refsInFormula(formula, sheetNames) {
  const found = new Set();
  if (!formula || typeof formula !== 'string') return found;
  for (const name of sheetNames) {
    if (formula.includes(`'${name}'!`) || formula.includes(`${name}!`)) found.add(name);
  }
  return found;
}

function collectNeededSheets(wb, mode = 'runtime') {
  if (mode === 'runtime') {
    const needed = new Set(RUNTIME_SHEETS.filter(s => wb.sheets[s]));
    if (wb.sheets['Hiz. Dökümü']) needed.add('Hiz. Dökümü');
    return needed;
  }
  const names = wb.order || Object.keys(wb.sheets);
  const needed = new Set(SEED_SHEETS.filter(s => wb.sheets[s]));
  let changed = true;
  while (changed) {
    changed = false;
    for (const sh of [...needed]) {
      for (const cell of Object.values(wb.sheets[sh]?.cells || {})) {
        for (const ref of refsInFormula(cell.f, names)) {
          if (!needed.has(ref) && wb.sheets[ref]) { needed.add(ref); changed = true; }
        }
      }
    }
  }
  return needed;
}

function trimHizDokumuSheet(sheet) {
  const cells = {};
  for (const [addr, cell] of Object.entries(sheet.cells || {})) {
    const m = /(\d+)$/.exec(addr);
    if (!m || +m[1] <= HIZ_SHEET_MAX_ROW) cells[addr] = cell;
  }
  return { ...sheet, max_row: Math.min(sheet.max_row || HIZ_SHEET_MAX_ROW, HIZ_SHEET_MAX_ROW), cells };
}

function buildTrimmed(wb, mode) {
  const needed = collectNeededSheets(wb, mode);
  const removed = Object.keys(wb.sheets).filter(s => !needed.has(s)).sort();
  const sheets = {};
  for (const name of needed) {
    sheets[name] = name === 'Hiz. Dökümü' ? trimHizDokumuSheet(wb.sheets[name]) : wb.sheets[name];
  }
  const order = (wb.order || Object.keys(wb.sheets)).filter(n => needed.has(n));
  return { book: { sheets, order }, needed: [...needed].sort(), removed };
}

function countBook(book) {
  let cells = 0, formulas = 0;
  for (const sh of Object.values(book.sheets)) {
    for (const c of Object.values(sh.cells || {})) { cells++; if (c.f) formulas++; }
  }
  return { cells, formulas, sheets: Object.keys(book.sheets).length };
}

const inArg = process.argv.find(a => a.startsWith('--in='));
const WB_IN = inArg ? path.resolve(inArg.slice(5)) : WB_DEFAULT;
const WB_OUT = inArg ? WB_DEFAULT : WB_DEFAULT;

const wb = JSON.parse(fs.readFileSync(WB_IN, 'utf8'));
const before = countBook(wb);
const { book, needed, removed } = buildTrimmed(wb, process.argv.includes('--bfs') ? 'bfs' : 'runtime');
const after = countBook(book);

fs.mkdirSync(path.dirname(MANIFEST), { recursive: true });
fs.writeFileSync(WB_OUT, JSON.stringify(book), 'utf8');
fs.writeFileSync(MANIFEST, JSON.stringify({
  generatedAt: new Date().toISOString(), kept: needed, removed,
  hizSheetMaxRow: HIZ_SHEET_MAX_ROW, before, after,
}, null, 2), 'utf8');

const inSize = fs.statSync(WB_IN).size;
const outSize = fs.statSync(WB_OUT).size;
console.log('Workbook budama tamam →', WB_OUT);
console.log(`  Sayfa: ${before.sheets} → ${after.sheets} (−${removed.length})`);
console.log(`  Boyut: ${(inSize / 1e6).toFixed(1)} MB → ${(outSize / 1e6).toFixed(1)} MB`);
if (removed.length) console.log(`  Kaldırılan: ${removed.join(', ')}`);
else console.log('  Zaten budanmış (değişiklik yok).');

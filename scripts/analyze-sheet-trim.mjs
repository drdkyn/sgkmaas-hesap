#!/usr/bin/env node
/**
 * Hangi sayfalar güvenle kaldırılabilir? Her aday için workbook kopyasıyla regresyon dener.
 * Çalıştır: node scripts/analyze-sheet-trim.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const WB_PATH = path.join(ROOT, 'data', 'workbook.json');
const BACKUP = path.join(ROOT, 'data', '_wb-backup.json');

const wb = JSON.parse(fs.readFileSync(WB_PATH, 'utf8'));
fs.writeFileSync(BACKUP, JSON.stringify(wb));

const sheets = Object.keys(wb.sheets).filter(s => s !== 'Hiz. Dökümü');
const cellCount = (s) => Object.keys(wb.sheets[s]?.cells || {}).length;

function runRegression() {
  const r = spawnSync(process.execPath, ['scripts/regression.mjs'], {
    cwd: ROOT, encoding: 'utf8', timeout: 120000,
  });
  return r.status === 0;
}

const REQUIRED = new Set();
const REMOVABLE = [];

console.log('Sayfa kaldırma testi (İbrahim fixture)...\n');
for (const drop of sheets.sort((a, b) => cellCount(b) - cellCount(a))) {
  const book = { sheets: { ...wb.sheets }, order: wb.order.filter(n => n !== drop) };
  delete book.sheets[drop];
  fs.writeFileSync(WB_PATH, JSON.stringify(book));
  const ok = runRegression();
  fs.writeFileSync(WB_PATH, JSON.stringify(wb));
  const info = { sheet: drop, cells: cellCount(drop), ok };
  if (ok) REMOVABLE.push(info);
  else REQUIRED.add(drop);
  console.log((ok ? 'KALDIRILABILIR' : 'GEREKLI     '), drop.padEnd(24), cellCount(drop).toString().padStart(7), 'hucre');
}

const savedMb = REMOVABLE.reduce((s, r) => s + r.cells, 0);
console.log('\n--- OZET ---');
console.log('Kaldirilabilir:', REMOVABLE.length, 'sayfa, ~', savedMb, 'hucre');
console.log(REMOVABLE.map(r => r.sheet).join(', '));
console.log('\nZorunlu:', [...REQUIRED].join(', '));

const out = {
  analyzedAt: new Date().toISOString(),
  removable: REMOVABLE,
  required: [...REQUIRED],
  hizDokumu: { sheet: 'Hiz. Dökümü', cells: cellCount('Hiz. Dökümü'), note: 'Ayri analiz — formül aginin cogu' },
};
fs.writeFileSync(path.join(ROOT, 'data', 'native', 'sheet-trim-analysis.json'), JSON.stringify(out, null, 2));
fs.unlinkSync(BACKUP);
console.log('\nYazildi: data/native/sheet-trim-analysis.json');

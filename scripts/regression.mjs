#!/usr/bin/env node
/**
 * Faz-1 regresyon testi — gömülü İbrahim Koyun fixture ile doğrulama.
 * Çalıştır: npm run regression
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { performance } from 'node:perf_hooks';
import { hesaplaFaz1 } from '../lib/native/hesapla-faz1.mjs';
import { fromSerial } from '../lib/native/excel-serial.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(__dirname, '..', 'data', 'native', 'fixture.json');
const TOL = 0.05;

const EXPECT = {
  maasAylik: 10897.21,
  maasEkOdeme: 728.42,
  maasToplam: 11625.63,
  primGunSayisi: 5730,
  sigortalilikSuresi: 21,
  senaryoSayisi: 2,
};

function ok(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) <= TOL;
  return a === b;
}

function loadInputs() {
  const f = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
  return {
    hizmetRows: f.hizmetRows,
    cinsiyet: f.cinsiyet,
    dogumTarihi: fromSerial(f.dogumTarihi).toDMY(),
    iseGirisTarihi: fromSerial(f.iseGirisTarihi).toDMY(),
    tahsisTarihi: fromSerial(f.tahsisTarihi).toDMY(),
    adSoyad: 'IBRAHIM KOYUN',
  };
}

console.log('=== Faz-1 Regresyon (İbrahim fixture) ===\n');

const inputs = loadInputs();
const t0 = performance.now();
const r = hesaplaFaz1(inputs);
const ms = Math.round(performance.now() - t0);

let pass = true;
for (const [k, exp] of Object.entries(EXPECT)) {
  if (k === 'senaryoSayisi') {
    const got = (r.senaryolar || []).length;
    const p = got === exp;
    console.log(`  ${p ? 'OK' : 'FAIL'} senaryolar: ${got} (beklenen ${exp})`);
    if (!p) pass = false;
    continue;
  }
  const p = ok(r[k], exp);
  console.log(`  ${p ? 'OK' : 'FAIL'} ${k}: ${r[k]} (beklenen ${exp})`);
  if (!p) pass = false;
}

console.log(`\n  süre: ${ms}ms | motor: ${r.evaluated} hücre | iters: ${r.iters}`);
console.log(`\n${pass ? 'GEÇTI ✓' : 'BAŞARISIZ ✗'}`);
process.exit(pass ? 0 : 1);

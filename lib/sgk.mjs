// App-facing wrapper: Faz-1 native hesaplama (optimize motor + native PÖGS/statü/çakışma).
import { hesaplaFaz1, _engineRef as faz1Engine } from './native/hesapla-faz1.mjs';
import { statuKontrol } from './native/statu.mjs';
import { cakismaCross } from './native/cakisma.mjs';
import { loadParams, saveParams } from './native/params.mjs';

export { statuKontrol, cakismaCross, loadParams, saveParams };

/** Ana hesaplama girişi — Faz-1 optimize yol. */
export function hesapla(inputs = {}) {
  return hesaplaFaz1(inputs);
}

export function _engineRef() { return faz1Engine(); }

export function readCell(ref) {
  const eng = faz1Engine();
  const i = ref.lastIndexOf('!'); const sh = ref.slice(0, i), co = ref.slice(i + 1);
  const cell = eng.book.sheets[sh] && eng.book.sheets[sh].cells[co];
  let v = cell ? cell.v : null;
  if (v && typeof v === 'object' && 'd' in v) v = v.d;
  return v == null ? '' : v;
}

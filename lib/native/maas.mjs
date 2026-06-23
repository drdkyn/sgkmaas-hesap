/** 4a bağlanacak maaş — motor solve + çıktı hücreleri (ileride tam native port). */

export const SOLVE_TARGET = 'Emekli Maaşı!AU62';

export const OUT_CELLS = {
  maasAylik: 'Emekli Maaşı!AU58',
  maasEkOdeme: 'Emekli Maaşı!AU60',
  maasToplam: 'Emekli Maaşı!AU62',
  tabanAylik: 'Emekli Maaşı!CZ1',
};

/**
 * Maaş hesap zincirini çözer ve sonuç hücrelerini döner.
 * @returns {{ iters: number, maasAylik, maasEkOdeme, maasToplam, tabanAylik }}
 */
export function hesaplaMaas(eng) {
  const solved = eng.solve(SOLVE_TARGET);
  const out = { iters: solved.iters };
  for (const [k, ref] of Object.entries(OUT_CELLS)) out[k] = eng.get(ref);
  return out;
}

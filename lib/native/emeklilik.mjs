/** Emeklilik şartları — motor çıktısını okur (ileride tam native port). */

const SENARYO_ROWS = [7, 8, 9, 10, 11, 12, 13];
export const SIGORTALILIK_SURE_REF = 'Emek. Hes.!AV3';

/** Emeklilik Şartları!A7:J13 → senaryo listesi. */
export function readSenaryolar(eng) {
  const senaryolar = [];
  for (const r of SENARYO_ROWS) {
    const ad = eng.get(`Emeklilik Şartları!A${r}`);
    if (ad == null || ad === '' || ad === 0) continue;
    senaryolar.push({
      ad: String(ad),
      sure: eng.get(`Emeklilik Şartları!H${r}`),
      yas: '',
      gun: eng.get(`Emeklilik Şartları!G${r}`),
      sonuc: String(eng.get(`Emeklilik Şartları!J${r}`) ?? ''),
    });
  }
  return senaryolar;
}

export function readSigortalilikSuresi(eng) {
  return eng.get(SIGORTALILIK_SURE_REF);
}

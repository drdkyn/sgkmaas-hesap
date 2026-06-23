import { toSerial } from './excel-serial.mjs';

const CUTOFF = toSerial('01.10.2008');
const STATU = ['4a (SSK)', '4b (Bağ-Kur)', '4c (Emekli Sandığı)'];

function statuAdi(A) {
  const a = String(A || '').toLowerCase().replace(/[()*]/g, '').trim();
  if (a === '4a') return '4a (SSK)';
  if (a === '4b') return '4b (Bağ-Kur)';
  if (a === '4c') return '4c (Emekli Sandığı)';
  return null;
}

function donemSerial(h) {
  const m = /(\d{4})[\/.](\d{1,2})/.exec(String(h || ''));
  return m ? toSerial('15.' + String(m[2]).padStart(2, '0') + '.' + m[1]) : null;
}

/** 2829 S.K. statü tespiti — son 7 yıl vs en çok hizmet. */
export function statuKontrol(rows, tahsisSerial, iseGirisSerial) {
  if (!Array.isArray(rows) || !rows.length) return null;
  const total = {};
  let ilkGiris = Infinity;
  const recs = [];
  const tahsis = (typeof tahsisSerial === 'number' && tahsisSerial > 0) ? tahsisSerial : null;
  for (const r of rows) {
    const kod = statuAdi(r.A); if (!kod) continue;
    const gun = (r.J === 'İptal' ? -1 : 1) * (Number(r.K) || 0);
    total[kod] = (total[kod] || 0) + gun;
    const gs = (typeof r.M === 'number') ? r.M : donemSerial(r.H);
    if (typeof gs === 'number' && gs < ilkGiris) ilkGiris = gs;
    recs.push({ kod, gun, ds: donemSerial(r.H) });
  }
  if (typeof iseGirisSerial === 'number' && iseGirisSerial > 0) ilkGiris = iseGirisSerial;
  const win = {};
  let acc = 0;
  for (const r of [...recs].filter(r => r.ds != null).sort((a, b) => b.ds - a.ds)) {
    if (acc >= 2520) break;
    let g = r.gun;
    if (g > 0 && acc + g > 2520) g = 2520 - acc;
    win[r.kod] = (win[r.kod] || 0) + g;
    if (g > 0) acc += g;
  }
  const ilkOnce = (ilkGiris !== Infinity && ilkGiris < CUTOFF);
  const sonYedi = ilkOnce && tahsis;
  const basis = sonYedi ? win : total;
  const statuler = STATU.map(ad => ({ ad, belirleyici: basis[ad] || 0, toplam: total[ad] || 0 }));
  const sorted = [...statuler].sort((a, b) => b.belirleyici - a.belirleyici);
  const belirlenen = sorted[0].belirleyici > 0 ? sorted[0].ad : null;
  const HEDEF = '4a (SSK)';
  const dortA = statuler.find(s => s.ad === HEDEF) || { belirleyici: 0, toplam: 0 };
  const toplamTumStatu = STATU.reduce((s, ad) => s + (total[ad] || 0), 0);
  const esik = sonYedi ? (Math.floor(acc / 2) + 1) : (Math.floor(toplamTumStatu / 2) + 1);
  const gerekenDaha = (belirlenen && belirlenen !== HEDEF) ? Math.max(0, esik - dortA.belirleyici) : 0;
  return {
    belirlenen,
    kural: sonYedi ? 'Son 7 yıl hizmet dağılımı (01.10.2008 öncesi ilk giriş)' : 'En çok hizmet (01.10.2008 sonrası ilk giriş)',
    basisAd: sonYedi ? 'Son 7 Yıl' : 'Toplam',
    statuler, hedefAd: HEDEF, hedefMevcut: dortA.belirleyici, esik, gerekenDaha,
  };
}

export { statuAdi, donemSerial };

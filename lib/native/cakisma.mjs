import { statuAdi } from './statu.mjs';

/** İşyeri-duyarlı çakışan hizmet (gösterim / net PÖGS düşümü). */
export function cakismaCross(rows) {
  if (!Array.isArray(rows)) return { cakisan: 0, detay: [] };
  const byMonth = {};
  for (const r of rows) {
    if (!statuAdi(r.A)) continue;
    const m = String(r.H || '');
    if (!/\d{4}[\/.]\d{1,2}/.test(m)) continue;
    const emp = String(r._isyeri || '?');
    const gun = (r.J === 'İptal' ? -1 : 1) * (Number(r.K) || 0);
    (byMonth[m] || (byMonth[m] = {}));
    byMonth[m][emp] = (byMonth[m][emp] || 0) + gun;
  }
  let cakisan = 0; const detay = [];
  for (const [m, emps] of Object.entries(byMonth)) {
    let sumCapped = 0, empCount = 0;
    for (const g of Object.values(emps)) if (g > 0) { sumCapped += Math.min(g, 30); empCount++; }
    const excess = sumCapped - 30;
    if (excess > 0 && empCount > 1) { cakisan += excess; detay.push({ donem: m, gun: -excess }); }
  }
  detay.sort((a, b) => a.donem.localeCompare(b.donem));
  return { cakisan, detay };
}

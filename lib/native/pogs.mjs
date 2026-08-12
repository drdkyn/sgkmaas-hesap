import { statuAdi } from './statu.mjs';

/**
 * Prim Ödeme Gün Sayısı (PÖGS) — dönem×işyeri grupları, her grup max 30 gün.
 * İptal kayıtları günü düşer.
 */
export function hesaplaPogs(rows) {
  if (!Array.isArray(rows) || !rows.length) return 0;
  const grp = {};
  for (const r of rows) {
    if (!statuAdi(r.A)) continue;
    const k = String(r.H) + '|' + String(r._isyeri || '?');
    grp[k] = (grp[k] || 0) + (r.J === 'İptal' ? -1 : 1) * (Number(r.K) || 0);
  }
  let pogs = 0;
  for (const g of Object.values(grp)) pogs += Math.max(0, Math.min(30, g));
  return pogs;
}

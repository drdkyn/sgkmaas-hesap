// Parse a pasted/PDF-extracted SGK "Hizmet Dökümü" into rows mapping to 'Hiz. Dökümü'!A..P.
// SGK text (especially from PDF) is NOT clean columns: variable spacing, wrapped names,
// missing optional fields, rows split across lines. So we parse each record SEMANTICALLY
// (find Dönem, Belge Türü, Gün, matrah, dates by pattern) instead of by fixed position.

const EPOCH = Date.UTC(1899, 11, 30), DAY = 86400000;
export function toSerial(s) {
  if (s == null) return '';
  const m = /^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})$/.exec(String(s).trim());
  if (m) return Math.round((Date.UTC(+m[3], +m[2] - 1, +m[1]) - EPOCH) / DAY);
  return String(s).trim();
}

const MONEY = /^\d{1,3}(?:[.,]\d{3})*[.,]\d{2}$/;     // 400.00 / 2,867.52 / 198,241.00 / 0,00
const DATE = /^\d{1,2}[.\/-]\d{1,2}[.\/-]\d{4}$/;
const DONEM = /\b((?:19|20)\d{2})[\/.](\d{2})\b/;
const BELGE = /\b(As[ıi]l|İptal|Iptal|İPTAL|Ek)\b/i;
const KOLU = /^(?:\(\*\)\s*)?(4a|4b|4c|GM20)$/i;

function parseRecord(seg) {
  const toks = seg.trim().split(/\s+/).filter(Boolean);
  if (!toks.length) return null;
  if (!KOLU.test(toks[0])) return null;
  const joined = toks.join(' ');
  const dm = DONEM.exec(joined);
  if (!dm) return null;                                   // no Dönem -> not a data row

  const row = { A: toks[0].replace(/^\(\*\)\s*/, ''), B: 'APHB', C: '', D: '', E: '', F: '', G: '', H: dm[1] + '/' + dm[2], I: 1, J: 'Asıl', K: '', L: '', M: '', N: '', O: '', P: '' };

  // Belge Türü: scan tokens after the Dönem token (exact match; \b fails around Turkish "İ")
  let donemIdx = toks.findIndex(t => DONEM.test(t));
  for (let i = (donemIdx >= 0 ? donemIdx + 1 : 0); i < toks.length; i++) {
    const tk = toks[i], tl = tk.toLocaleLowerCase('tr');
    if (tl === 'i̇ptal' || tl === 'iptal' || tk === 'İptal' || tk === 'İPTAL' || tl.indexOf('ptal') >= 0) { row.J = 'İptal'; break; }
    if (tk === 'Ek' || tl === 'ek') { row.J = 'Ek'; break; }
    if (/^as[ıi]l$/i.test(tk)) { row.J = 'Asıl'; break; }
  }

  // matrah = first MONEY token; gün = integer right before it
  let matrahIdx = -1;
  for (let i = 0; i < toks.length; i++) { if (MONEY.test(toks[i])) { matrahIdx = i; break; } }
  if (matrahIdx >= 0) {
    row.L = toks[matrahIdx];
    for (let i = matrahIdx - 1; i >= 0; i--) {
      if (/^\d{1,3}$/.test(toks[i])) { const g = +toks[i]; if (g >= 0 && g <= 366) { row.K = g; break; } }
    }
  }
  // dates: before matrah -> Giriş; after matrah -> Çıkış
  for (let i = 0; i < toks.length; i++) {
    if (DATE.test(toks[i])) {
      if (matrahIdx < 0 || i < matrahIdx) { if (!row.M) row.M = toSerial(toks[i]); }
      else row.O = toSerial(toks[i]);
    }
  }
  // sicil (13 digits) and statü hint
  const sm = joined.match(/\b\d{13}\b/); if (sm) row.C = sm[0];
  const stat = joined.match(/506\s*\/\s*APHB|APHB/); if (stat) row.B = stat[0].replace(/\s+/g, ' ');
  return row;
}

export function parseHizmet(text) {
  if (!text) return [];
  const flat = String(text).replace(/\r/g, '').replace(/\n/g, ' ');
  const rows = [];
  // split on TOPLAM (subtotal lines) then on each kolu marker
  for (const seg of flat.split(/\bTOPLAM\b/i)) {
    const parts = seg.split(/(?=(?:\(\*\)\s*)?\b(?:4a|4b|4c|GM20)\b)/i);
    for (const p of parts) { const r = parseRecord(p); if (r) rows.push(r); }
  }
  return rows;
}

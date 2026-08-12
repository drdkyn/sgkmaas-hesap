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
const GOSTERGE = /^\d{1,3}(?:[.,]\d{3})*[.,]\d{2}\/$/; // 4c (Emekli Sandığı) gösterge "754.02/" / "1,016.25/"
const DATE = /^\d{1,2}[.\/-]\d{1,2}[.\/-]\d{4}$/;
const DONEM = /\b((?:19|20)\d{2})[\/.](\d{2})\b/;
const BELGE = /\b(As[ıi]l|İptal|Iptal|İPTAL|Ek)\b/i;
const KOLU = /^(?:\(\*\)\s*)?(4a|4b|4c|GM20)$/i;

function parseRecord(seg) {
  // Tokenise while remembering whether each token was preceded by a TAB. In SGK PDF text the
  // Giriş Tarihi sits in its own column (TAB before it) while a lone Çıkış Tarihi is rendered
  // right after matrah (SPACE). This disambiguates the day=gün ties below.
  const tabBefore = [];
  const toks = [];
  { const re = /([ \t]*)(\S+)/g; let m; while ((m = re.exec(seg.replace(/\r|\n/g, ' ')))) { tabBefore.push(/\t/.test(m[1])); toks.push(m[2]); } }
  if (!toks.length) return null;
  if (!KOLU.test(toks[0])) return null;
  const joined = toks.join(' ');
  const dm = DONEM.exec(joined);
  if (!dm) return null;                                   // no Dönem -> not a data row

  const row = { A: toks[0].replace(/^\(\*\)\s*/, ''), B: 'APHB', C: '', D: '', E: '', F: '', G: '', H: dm[1] + '/' + dm[2], I: 1, J: 'Asıl', K: '', L: '', M: '', N: '', O: '', P: '' };

  // Statü (B) and Adı Soyadı (D). After the kolu marker the layout is: <statü> [sicil?] <NAME> …
  // Statü = "APHB" / "506/ APHB" (4a), "5434 S.K." / "5434 S.K. FHZ" (4c), Bağ-Kur (4b)… The name
  // is the run of all-caps Turkish words after it. Both must be correct: the engine drops rows
  // with empty D, and classifies by B — 4c must NOT be "APHB" or BM10 mislabels it as 4a (0.01)
  // instead of 4c (0.05).
  {
    const STAT_KW = new Set(['APHB', 'FHZ', 'TOPLAM']);     // all-caps tokens that belong to statü, not the name
    const isName = (t) => /^[A-ZÇĞİÖŞÜ]{2,}$/.test(t) && !STAT_KW.has(t);
    let i = 1;
    const statTok = [];
    for (; i < toks.length; i++) { if (DONEM.test(toks[i]) || isName(toks[i])) break; statTok.push(toks[i]); }
    const bToks = statTok.filter(t => !/^\d{13}$/.test(t) && !/^\(/.test(t));   // drop 13-digit sicil + "(latin"
    if (bToks.length) row.B = bToks.join(' ');
    const nameToks = [];
    for (let j = i; j < toks.length; j++) { if (DONEM.test(toks[j])) break; if (isName(toks[j])) nameToks.push(toks[j]); else if (nameToks.length) break; }
    if (nameToks.length) row.D = nameToks.join(' ');
  }

  // Belge Türü: scan tokens after the Dönem token (exact match; \b fails around Turkish "İ")
  let donemIdx = toks.findIndex(t => DONEM.test(t));
  // İşyeri/Kurum No: dönem'den hemen önce [işyeri][ünite] gelir (ünite 4 haneli kod, işyeri ~7 haneli).
  // Aynı ay içinde FARKLI işyeri = çakışan hizmet; AYNI işyeri (ücret bölünmesi) = ay-30 kapaması.
  if (donemIdx >= 2) {
    const isy = toks[donemIdx - 2];
    if (/^\d{4,8}$/.test(isy)) row._isyeri = isy;
  }
  for (let i = (donemIdx >= 0 ? donemIdx + 1 : 0); i < toks.length; i++) {
    const tk = toks[i], tl = tk.toLocaleLowerCase('tr');
    if (tl === 'i̇ptal' || tl === 'iptal' || tk === 'İptal' || tk === 'İPTAL' || tl.indexOf('ptal') >= 0) { row.J = 'İptal'; break; }
    if (tk === 'Ek' || tl === 'ek') { row.J = 'Ek'; break; }
    if (/^as[ıi]l$/i.test(tk)) { row.J = 'Asıl'; break; }
  }

  // Kazanç token = matrah (4a money "400.00") OR gösterge (4c "754.02/" with trailing slash).
  // Gün is the integer (0..366) immediately before it; for 4c L gets the gösterge (slash stripped).
  let matrahIdx = -1, isGosterge = false;
  for (let i = 0; i < toks.length; i++) { if (MONEY.test(toks[i])) { matrahIdx = i; break; } }
  if (matrahIdx < 0) { for (let i = 0; i < toks.length; i++) { if (GOSTERGE.test(toks[i])) { matrahIdx = i; isGosterge = true; break; } } }
  if (matrahIdx >= 0) {
    // 4a: L = money. 4c: L MUST keep the "/" — the engine does VALUE(SUBSTITUTE(LEFT(L,FIND("/")-1)))
    // to read the gösterge; append the ek gösterge token too ("754.02/ 0") to mirror Excel.
    if (isGosterge) {
      const ek = (matrahIdx + 1 < toks.length && /^\d{1,5}$/.test(toks[matrahIdx + 1])) ? ' ' + toks[matrahIdx + 1] : '';
      row.L = toks[matrahIdx] + ek;
    } else row.L = toks[matrahIdx];
    for (let i = matrahIdx - 1; i >= 0; i--) {
      if (/^\d{1,3}$/.test(toks[i])) { const g = +toks[i]; if (g >= 0 && g <= 366) { row.K = g; break; } }
    }
  }
  // dates: Giriş Tarihi and Çıkış Tarihi are separate columns but SGK text doesn't keep them
  // positional. A date before matrah is Giriş (paste layout). For dates AFTER matrah (PDF layout):
  // two dates -> [Giriş, Çıkış]; a single date is disambiguated by the day-vs-gün rule
  // (giriş => daysInMonth - day + 1 ≈ gün; çıkış => day ≈ gün).
  const before = [], after = [];
  for (let i = 0; i < toks.length; i++) {
    if (DATE.test(toks[i])) (matrahIdx < 0 || i < matrahIdx ? before : after).push({ d: toks[i], tab: tabBefore[i] });
  }
  if (before.length && !row.M) row.M = toSerial(before[0].d);
  if (after.length >= 2) {
    if (!row.M) row.M = toSerial(after[0].d);
    row.O = toSerial(after[after.length - 1].d);
  } else if (after.length === 1) {
    const { d, tab } = after[0], K = +row.K || 0;
    const day = +(/^(\d{1,2})/.exec(d)[1]);
    const [yy, mm] = row.H.split('/').map(Number);
    const dim = new Date(yy, mm, 0).getDate();               // real days in that month
    const girisFit = Math.abs((dim - day + 1) - K), cikisFit = Math.abs(day - K);
    // day=gün fit decides; on a tie use the column signal (Giriş is TAB-separated, lone Çıkış SPACE)
    const isGiris = girisFit < cikisFit || (girisFit === cikisFit && tab);
    if (isGiris) { if (!row.M) row.M = toSerial(d); }
    else row.O = toSerial(d);
  }
  // sicil (13 digits)
  const sm = joined.match(/\b\d{13}\b/); if (sm) row.C = sm[0];
  return row;
}

// e-Devlet yapıştırmasında Kolu sütunu bazen boş gelir (birleşik hücre); satır 4a/4c ile başlamaz
// ama dönem+belge içerir. Önceki satırın kolu'sunu devral.
function preprocessOrphanRows(text) {
  const lines = String(text).replace(/\r/g, '').split('\n');
  let lastKolu = '';
  const out = [];
  const KOLU_START = /^(?:\(\*\)\s*)?(4a|4b|4c|GM20)\b/i;
  const DATA_ROW = /\b(19|20)\d{2}\/\d{2}\b.*\b(As[ıi]l|Ek|İptal|Iptal)\b/i;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) { out.push(line); continue; }
    const km = KOLU_START.exec(trimmed);
    if (km) { lastKolu = km[1].toLowerCase(); out.push(line); continue; }
    if (lastKolu && DATA_ROW.test(trimmed) && !KOLU_START.test(trimmed)) {
      const lead = line.match(/^\s*/)?.[0] || '';
      out.push(lead + lastKolu + ' ' + trimmed);
    } else out.push(line);
  }
  return out.join('\n');
}

// SGK döküm başlığındaki resmi özet: "Toplam 4a … : 22, Toplam 4c … : 7080"
export function parseSgkOzet(text) {
  const t = String(text || '');
  const m4a = /Toplam\s+4a[^\d]{0,40}(\d+)/i.exec(t);
  const m4c = /Toplam\s+4c[^\d]{0,40}(\d+)/i.exec(t);
  const toplam4a = m4a ? +m4a[1] : null;
  const toplam4c = m4c ? +m4c[1] : null;
  const toplam = toplam4a != null && toplam4c != null ? toplam4a + toplam4c : null;
  return { toplam4a, toplam4c, toplam };
}

export function parseHizmet(text) {
  if (!text) return [];
  const flat = preprocessOrphanRows(text).replace(/\r/g, '').replace(/\n/g, ' ');
  const rows = [];
  // split on TOPLAM (subtotal lines) then on each kolu marker
  for (const seg of flat.split(/\bTOPLAM\b/i)) {
    const parts = seg.split(/(?=(?:\(\*\)\s*)?\b(?:4a|4b|4c|GM20)\b)/i);
    for (const p of parts) { const r = parseRecord(p); if (r) rows.push(r); }
  }
  return rows;
}

// SGK döküm BAŞLIĞINDAN kişi bilgisi çıkar: cinsiyet (E/K) ve doğum tarihi (gg.aa.yyyy).
// Başlık metni karışık sıralı (PDF) olduğundan: cinsiyet = ERKEK/KADIN token; doğum = ilk kolu
// kaydından ÖNCEKİ alanda, yılı makul (1930..bugün-10) olan gg.aa.yyyy tarih (sorgu/2026 tarihi değil).
export function parseKisi(text) {
  const t = String(text || '');
  const out = { cinsiyet: '', dogumTarihi: '', adSoyad: '', tcKimlik: '' };
  if (!t.trim()) return out;
  // başlık = ilk kolu (4a/4b/4c/GM20) işaretçisine kadar
  const flat = t.replace(/\r/g, '');
  const km = /(?:^|\s)(?:\(\*\)\s*)?(4a|4b|4c|GM20)\b/.exec(flat);
  const head = km ? flat.slice(0, km.index) : flat.slice(0, 1500);
  // cinsiyet
  const cm = /\b(ERKEK|KADIN|KADİN|KADIN|Erkek|Kad[ıi]n)\b/.exec(head);
  if (cm) out.cinsiyet = /^k/i.test(cm[1]) ? 'K' : 'E';
  // doğum tarihi: başlıktaki gg.aa.yyyy tarihlerinden yılı 1930..(bugün-10) olan
  const nowY = new Date().getFullYear();
  const dates = [...head.matchAll(/\b(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})\b/g)];
  for (const d of dates) {
    const y = +d[3];
    if (y >= 1930 && y <= nowY - 10) { out.dogumTarihi = `${d[1].padStart(2, '0')}.${d[2].padStart(2, '0')}.${y}`; break; }
  }
  // TC (11 hane) ve ad-soyad (Adı/Soyadı yakınında)
  const tcm = /\b(\d{11})\b/.exec(head); if (tcm) out.tcKimlik = tcm[1];
  return out;
}

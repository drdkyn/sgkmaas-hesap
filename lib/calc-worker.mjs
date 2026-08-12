// Heavy formula engine runs here, in a plain Node child process. Next.js bundles/transpiles
// the engine into its server runtime, which deoptimizes the chevrotain (fast-formula-parser)
// hot loop ~15x (a 13s calc became ~130s). Spawning a fresh `node` per request keeps the calc
// fast AND leaves no personal data in memory after it exits.
//
// Protocol: reads one JSON object {hizmetText?|hizmetRows?, dogumTarihi?, ...} on stdin,
// writes the clean result (or {error}) JSON on stdout.
import { hesapla, syncParams, syncParamsRows, loadParams } from './sgk.mjs';
import { parseHizmet, parseKisi } from './parse-hizmet.mjs';
import { head } from '@vercel/blob';

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => { buf += c; });
process.stdin.on('end', async () => {
  try {
    // GEÇİCİ TEŞHİS (5. tur) — cache-busting sonrası hâlâ eski değer okunuyor, tüm zinciri
    // (head bilgisi, ham içerik, dosyaya yazılan içerik) uçtan uca gösteriyoruz.
    const debug = {};
    const tok = process.env.BLOB_READ_WRITE_TOKEN?.trim();
    if (tok) {
      try {
        const info = await head('admin-store/params.json', { token: tok });
        debug.headSize = info.size;
        debug.headUploadedAt = info.uploadedAt;
        const bustUrl = `${info.url}?v=${encodeURIComponent(info.uploadedAt)}`;
        debug.fetchUrl = bustUrl;
        const res = await fetch(bustUrl, { cache: 'no-store' });
        debug.fetchStatus = res.status;
        debug.fetchBody = await res.text();
      } catch (e) {
        debug.headError = String((e && e.message) || e);
      }
    } else {
      debug.noToken = true;
    }
    debug.paramsBeforeSync = loadParams();
    await Promise.all([syncParams(), syncParamsRows()]);
    debug.paramsAfterSync = loadParams();
    const body = buf ? JSON.parse(buf) : {};
    const inputs = { ...body };
    // Satırlar: düzenlenmiş hizmetRows ÖNCELİKLİ (çıkış tarihi düzenlemeleri korunur); yoksa metinden parse et.
    const hasRows = Array.isArray(body.hizmetRows) && body.hizmetRows.length;
    if (!hasRows && typeof body.hizmetText === 'string' && body.hizmetText.trim()) {
      inputs.hizmetRows = parseHizmet(body.hizmetText);
      if (inputs.hizmetRows.length === 0) {
        process.stdout.write(JSON.stringify({ error: 'Hizmet dökümü tablosu okunamadı. Lütfen tabloyu (Ctrl+A, Ctrl+C) kopyalayıp yapıştırın.' }));
        return;
      }
    }
    // Cinsiyet/doğum/ad/tc dökümden OTOMATİK (kullanıcı elle vermediyse).
    if (typeof body.hizmetText === 'string' && body.hizmetText.trim()) {
      const kisi = parseKisi(body.hizmetText);
      if (!inputs.cinsiyet && kisi.cinsiyet) inputs.cinsiyet = kisi.cinsiyet;
      if (!inputs.dogumTarihi && kisi.dogumTarihi) inputs.dogumTarihi = kisi.dogumTarihi;
      if (!inputs.adSoyad && kisi.adSoyad) inputs.adSoyad = kisi.adSoyad;
      if (!inputs.tcKimlik && kisi.tcKimlik) inputs.tcKimlik = kisi.tcKimlik;
    }
    // Tahsis/müracaat tarihi boşsa BUGÜN.
    if (!inputs.tahsisTarihi) {
      const d = new Date();
      inputs.tahsisTarihi = `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
    }
    const result = hesapla(inputs);
    result.satirSayisi = Array.isArray(inputs.hizmetRows) ? inputs.hizmetRows.length : null;
    result._debug = debug;
    process.stdout.write(JSON.stringify(result));
  } catch (e) {
    process.stdout.write(JSON.stringify({ error: String((e && e.message) || e) }));
    process.exitCode = 1;
  }
});

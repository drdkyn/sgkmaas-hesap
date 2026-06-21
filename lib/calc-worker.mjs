// Heavy formula engine runs here, in a plain Node child process. Next.js bundles/transpiles
// the engine into its server runtime, which deoptimizes the chevrotain (fast-formula-parser)
// hot loop ~15x (a 13s calc became ~130s). Spawning a fresh `node` per request keeps the calc
// fast AND leaves no personal data in memory after it exits.
//
// Protocol: reads one JSON object {hizmetText?|hizmetRows?, dogumTarihi?, ...} on stdin,
// writes the clean result (or {error}) JSON on stdout.
import { hesapla } from './sgk.mjs';
import { parseHizmet } from './parse-hizmet.mjs';

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => { buf += c; });
process.stdin.on('end', () => {
  try {
    const body = buf ? JSON.parse(buf) : {};
    const inputs = { ...body };
    if (typeof body.hizmetText === 'string' && body.hizmetText.trim()) {
      inputs.hizmetRows = parseHizmet(body.hizmetText);
      if (inputs.hizmetRows.length === 0) {
        process.stdout.write(JSON.stringify({ error: 'Hizmet dökümü tablosu okunamadı. Lütfen tabloyu (Ctrl+A, Ctrl+C) kopyalayıp yapıştırın.' }));
        return;
      }
    }
    const result = hesapla(inputs);
    result.satirSayisi = Array.isArray(inputs.hizmetRows) ? inputs.hizmetRows.length : null;
    process.stdout.write(JSON.stringify(result));
  } catch (e) {
    process.stdout.write(JSON.stringify({ error: String((e && e.message) || e) }));
    process.exitCode = 1;
  }
});

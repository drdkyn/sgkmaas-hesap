// calc-worker.mjs ile aynı gerekçe: pdf-parse (ve native @napi-rs/canvas bağımlılığı) Next'in
// bundler'ından/serverExternalPackages izlemesinden tamamen bağımsız, düz bir Node process'te
// çalışsın — bu proje için o yol doğrulanmamıştı ve Vercel'de başarısız oluyordu.
// Protokol: stdin'den base64 PDF verisi okur, stdout'a {text} veya {error} JSON yazar.
let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => { buf += c; });
process.stdin.on('end', async () => {
  try {
    const data = Buffer.from(buf, 'base64');
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: new Uint8Array(data) });
    const out = await parser.getText();
    const text = (out && (out.text ?? '')) || '';
    process.stdout.write(JSON.stringify({ text }));
  } catch (e) {
    process.stdout.write(JSON.stringify({ error: String((e && e.message) || e) }));
    process.exitCode = 1;
  }
});

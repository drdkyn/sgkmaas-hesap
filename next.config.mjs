/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep the formula engine + its CJS dep out of the bundler (used only server-side).
  // pdf-parse/pdfjs must stay external too — bundling breaks pdfjs internals at runtime
  // ("Object.defineProperty called on non-object").
  serverExternalPackages: ['fast-formula-parser', 'pdf-parse'],
  agentRules: false,
  outputFileTracingIncludes: {
    // calc-worker.mjs bir alt process olarak spawn ediliyor (bkz. lib/calc-worker.mjs yorumu);
    // Next'in bundler'ı onu işlemediği için dosya izleme (file tracing) onun require/import
    // ettiği dosyaları OTOMATİK bulamıyor — spawn edilen dosyayı tespit edip ekliyor ama
    // KENDİ bağımlılıklarını (lib/sgk.mjs, native/*, fast-formula-parser, @vercel/blob…)
    // izlemiyor. Bu yüzden lib/** ve gereken paketler burada açıkça listeleniyor; aksi halde
    // Vercel'de "Cannot find module" ile çöker (doğrulandı: nft.json'daki dosyalarla izole
    // bir klasörde çalıştırınca gerçekten patlıyor).
    '/api/hesapla': [
      './data/workbook.json', './data/params.json', './data/params-rows.json',
      './lib/**',
      // @vercel/blob'un tam bağımlılık ağacı (dahil OIDC/CLI fallback kolu — kullanılmıyor
      // ama modül yüklenirken require ediliyor, hepsi küçük saf-JS paketler):
      './node_modules/@vercel/blob/**',
      './node_modules/@vercel/oidc/**',
      './node_modules/@vercel/cli-config/**',
      './node_modules/@vercel/cli-exec/**',
      './node_modules/jose/**',
      './node_modules/async-retry/**',
      './node_modules/retry/**',
      './node_modules/is-buffer/**',
      './node_modules/is-node-process/**',
      './node_modules/throttleit/**',
      './node_modules/undici/**',
      './node_modules/execa/**',
      './node_modules/cross-spawn/**',
      './node_modules/get-stream/**',
      './node_modules/human-signals/**',
      './node_modules/is-stream/**',
      './node_modules/isexe/**',
      './node_modules/merge-stream/**',
      './node_modules/mimic-fn/**',
      './node_modules/npm-run-path/**',
      './node_modules/onetime/**',
      './node_modules/os-paths/**',
      './node_modules/path-key/**',
      './node_modules/shebang-command/**',
      './node_modules/shebang-regex/**',
      './node_modules/signal-exit/**',
      './node_modules/strip-final-newline/**',
      './node_modules/which/**',
      './node_modules/xdg-app-paths/**',
      './node_modules/xdg-portable/**',
      './node_modules/zod/**',
      './node_modules/fast-formula-parser/**',
      './node_modules/bahttext/**',
      './node_modules/bessel/**',
      './node_modules/jstat/**',
    ],
    '/api/admin': ['./data/workbook.json', './data/params-catalog.json', './data/params.json', './data/params-rows.json'],
  },
};
export default nextConfig;

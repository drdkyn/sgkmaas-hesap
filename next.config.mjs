/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep the formula engine + its CJS dep out of the bundler (used only server-side).
  // pdf-parse/pdfjs must stay external too — bundling breaks pdfjs internals at runtime
  // ("Object.defineProperty called on non-object").
  serverExternalPackages: ['fast-formula-parser', 'pdf-parse'],
  outputFileTracingIncludes: {
    '/api/hesapla': ['./data/workbook.json', './data/params.json', './data/params-rows.json'],
    '/api/admin': ['./data/params-catalog.json', './data/params.json', './data/params-rows.json'],
  },
};
export default nextConfig;

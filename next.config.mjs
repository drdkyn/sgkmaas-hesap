/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep the formula engine + its CJS dep out of the bundler (used only server-side).
  serverExternalPackages: ['fast-formula-parser'],
  outputFileTracingIncludes: {
    '/api/hesapla': ['./data/workbook.json', './data/params.json'],
    '/api/admin': ['./data/params-catalog.json', './data/params.json'],
  },
};
export default nextConfig;

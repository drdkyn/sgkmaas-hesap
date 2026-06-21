// Wrap bare (unquoted) sheet-name references in single quotes so HyperFormula parses them.
// openpyxl quotes names with spaces but NOT names with dots (e.g. "Giriş.", "Em.San.").
export function buildRequoter(sheetNames) {
  // longest first to avoid prefix collisions
  const names = [...sheetNames].sort((a, b) => b.length - a.length);
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // For each name build: not preceded by ' or word-char/dot, the name, then !
  const parts = names.map(n => `(?<![A-Za-z0-9_'.\\u00C0-\\uFFFF])${esc(n)}!`);
  const re = new RegExp('(' + parts.join('|') + ')', 'g');
  const set = new Set(sheetNames);
  return function requote(formula) {
    if (typeof formula !== 'string' || formula.indexOf('!') === -1) return formula;
    return formula.replace(re, m => {
      const name = m.slice(0, -1); // drop '!'
      return set.has(name) ? `'${name}'!` : m;
    });
  };
}

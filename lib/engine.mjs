// Production-shape engine: cell-precise lazy evaluator with lazy lookups (no structural cycles).
import FormulaParser from 'fast-formula-parser';
import _ops from 'fast-formula-parser/formulas/operators.js';
import { buildRequoter } from './requote.mjs';
const { FormulaError } = FormulaParser;

// Patch FFP's infix operators (shared module, once) for two Excel behaviours FFP lacks:
//  (1) blank-cell semantics: a blank (null) equals BOTH "" and 0.
//  (2) element-wise ARRAY arithmetic (FFP 1.0.19 has none) so SUMPRODUCT/array formulas work.
if (!_ops.Infix.__patched) {
  const origCompare = _ops.Infix.compareOp;
  // scalar compare with blank coercion
  const scalarCompare = function (v1, op, v2, a1, a2) {
    if (v1 === null || v1 === undefined) v1 = (typeof v2 === 'number') ? 0 : '';
    if (v2 === null || v2 === undefined) v2 = (typeof v1 === 'number') ? 0 : '';
    return origCompare.call(this, v1, op, v2, a1, a2);
  };
  // wrap a scalar op so array operands broadcast element-wise -> 2D array
  function arrayWrap(scalarOp) {
    return function (v1, op, v2, a1, a2) {
      const A1 = Array.isArray(v1), A2 = Array.isArray(v2);
      if (!A1 && !A2) return scalarOp.call(this, v1, op, v2, a1, a2);
      const rows = Math.max(A1 ? v1.length : 1, A2 ? v2.length : 1), out = [];
      for (let i = 0; i < rows; i++) {
        const r1 = A1 ? v1[Math.min(i, v1.length - 1)] : null, r2 = A2 ? v2[Math.min(i, v2.length - 1)] : null;
        const cols = Math.max(A1 && r1 ? r1.length : 1, A2 && r2 ? r2.length : 1), orow = [];
        for (let j = 0; j < cols; j++) {
          const e1 = A1 ? (r1 ? r1[Math.min(j, r1.length - 1)] : 0) : v1;
          const e2 = A2 ? (r2 ? r2[Math.min(j, r2.length - 1)] : 0) : v2;
          orow.push(scalarOp.call(this, e1, op, e2, false, false));
        }
        out.push(orow);
      }
      return out;
    };
  }
  // Turkish-decimal coercion for math operands ("1234,56" -> 1234.56); Excel-TR coerces text in +,-,*,/
  function trNum(s) {
    if (typeof s !== 'string') return s; const t = s.trim(); if (t === '') return s;
    let x = t;
    if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(x)) x = x.replace(/\./g, '').replace(',', '.');
    else if (/^-?\d+,\d+$/.test(x)) x = x.replace(',', '.');
    else if (!/^-?\d+(\.\d+)?$/.test(x)) return s; // not numeric -> leave (Excel #VALUE)
    const n = Number(x); return isNaN(n) ? s : n;
  }
  const origMath = _ops.Infix.mathOp;
  const scalarMath = function (v1, op, v2, a1, a2) { return origMath.call(this, trNum(v1), op, trNum(v2), a1, a2); };
  _ops.Infix.compareOp = arrayWrap(scalarCompare);
  _ops.Infix.mathOp = arrayWrap(scalarMath);
  _ops.Infix.concatOp = arrayWrap(_ops.Infix.concatOp);
  _ops.Infix.__patched = true;
}

function colToIdx(letters) { let n = 0; for (let i = 0; i < letters.length; i++) n = n * 26 + (letters.charCodeAt(i) - 64); return n - 1; }
function idxToCol(n) { let s = ''; n++; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }
function coordOf(row1, col1) { return idxToCol(col1 - 1) + row1; }

const ERR = { NUM: FormulaError.NUM, VALUE: FormulaError.VALUE, NA: FormulaError.NA, REF: FormulaError.REF };

function createEngine(book, opts = {}) {
  const requote = buildRequoter(book.order);
  const cache = new Map();
  const lastVal = new Map(); // fixed-point iterate values for cyclic cells
  const inProgress = new Set();
  const cyclic = new Set();
  const overrides = new Map(); // sheet!coord -> value (user inputs)
  const stats = { evaluated: 0, backEdges: 0, errors: {}, errEx: {} };
  let stack = [];
  let maxHizRow = opts.maxHizRow ?? (opts.hizSheetMaxRow ?? 890);
  const HIZ_SHEET = 'Hiz. Dökümü';
  const HIZ_INPUT_MAX_COL = colToIdx('P') + 1;
  const hizCap = opts.hizSheetMaxRow ?? 890;

  function trimHizRanges(fstr) {
    if (maxHizRow >= hizCap) return fstr;
    let s = fstr;
    for (const cap of [810, 890]) {
      if (!s.includes(String(cap))) continue;
      s = s.replace(new RegExp('\\$' + cap + '\\b', 'g'), '$' + maxHizRow);
      s = s.replace(new RegExp(':' + cap + '\\b', 'g'), ':' + maxHizRow);
    }
    return s;
  }

  function rawCell(sheet, coord) { const sh = book.sheets[sheet]; return sh ? sh.cells[coord] : undefined; }
  function decode(v) { if (v && typeof v === 'object' && 'd' in v) return v.d; return v === undefined ? null : v; }
  function cachedVal(cell) { const v = decode(cell.v); return v == null ? 0 : v; }
  function note(reason, key, f) { stats.errors[reason] = (stats.errors[reason] || 0) + 1; if (!stats.errEx[reason]) stats.errEx[reason] = key + ' :: ' + (f || '').slice(0, 80); }

  // ---- lazy value access ----
  function getVal(sheet, row1, col1) {
    const coord = coordOf(row1, col1);
    const key = sheet + '!' + coord;
    if (overrides.has(key)) return overrides.get(key);
    if (cache.has(key)) return cache.get(key);
    // Faz-1: boş girdi satırları (A–P) atla; türev sütunlar (Q+) normal değerlendirilir.
    if (sheet === HIZ_SHEET && row1 > maxHizRow && col1 <= HIZ_INPUT_MAX_COL) {
      cache.set(key, 0); return 0;
    }
    const cell = rawCell(sheet, coord);
    if (!cell) { cache.set(key, null); return null; }
    if (cell.f == null) { const v = decode(cell.v); cache.set(key, v); return v; }
    if (inProgress.has(key)) {
      stats.backEdges++; cyclic.add(key);
      if (lastVal.has(key)) return lastVal.get(key);     // fixed-point: last iterate
      const v = decode(cell.v); return v == null ? 0 : v; // seed: Excel cached value
    }
    inProgress.add(key); stack.push(key); stats.evaluated++;
    if (opts.trackSheets) (stats.sheetsTouched || (stats.sheetsTouched = new Set())).add(sheet);
    let result;
    try {
      let fstr = requote(cell.f); if (fstr[0] === '=') fstr = fstr.slice(1);
      fstr = trimHizRanges(fstr);
      if (fstr.trim() === '') { result = '='; inProgress.delete(key); stack.pop(); cache.set(key, result); return result; }
      const p = getParser(stack.length - 1); // re-entrancy: a distinct parser per recursion depth
      result = p.parse(fstr, { sheet, row: row1, col: col1 });
      if (result && typeof result === 'object' && result.result !== undefined) result = result.result;
      if (result instanceof FormulaError) { note('FE:' + result.error, key, cell.f); if (opts.fallbackCached) result = cachedVal(cell); }
      // Excel: a formula whose result is an empty-cell reference yields 0 (not blank).
      if (result === null || result === undefined) result = 0;
    } catch (e) {
      if (opts.traceErr && /Cannot read/.test((e && e.message) || '') && (global.__t = (global.__t || 0) + 1) <= 3) { console.error('TRACE#' + global.__t, 'depth=' + (stack.length - 1), key, '::', cell.f, '\nMSG:', e && e.message, '\nINNER:', (e.details && e.details.stack ? e.details.stack.split('\n').slice(0, 5).join('\n') : '(no details)')); }
      note(((e && e.message) || String(e)).split('\n')[0].slice(0, 40), key, cell.f);
      result = opts.fallbackCached ? cachedVal(cell) : ERR.VALUE;
    }
    inProgress.delete(key); stack.pop();
    cache.set(key, result);
    return result;
  }

  // ---- range helpers (lazy) ----
  function refToCells(refObj, posSheet) {
    const r = refObj.ref || refObj;
    const sheet = r.sheet || posSheet;
    return { sheet, from: r.from, to: r.to };
  }
  function colValues(sheet, col, r1, r2) { const out = []; for (let r = r1; r <= r2; r++) out.push(getVal(sheet, r, col)); return out; }

  const num = x => (typeof x === 'number' ? x : typeof x === 'boolean' ? (x ? 1 : 0) : (x == null || x === '' ? NaN : parseNum(x)));
  function parseNum(x) {
    if (typeof x === 'number') return x; if (typeof x === 'boolean') return x ? 1 : 0; if (x == null) return NaN;
    let s = String(x).trim(); if (s === '') return NaN;
    if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^-?\d+,\d+$/.test(s)) s = s.replace(',', '.');
    const n = Number(s); return isNaN(n) ? NaN : n;
  }
  function eqExcel(a, b) {
    if (typeof a === 'number' && typeof b === 'number') return a === b;
    if (a == null) a = ''; if (b == null) b = '';
    if (typeof a === 'string' || typeof b === 'string') return String(a).toLowerCase() === String(b).toLowerCase();
    return a === b;
  }

  // ---- materialized-arg helpers for non-lookup funcs ----
  const valOf = a => (a && typeof a === 'object' && 'value' in a ? a.value : a);
  function flatNums(args) { const out = []; for (const a of args) { const v = valOf(a); if (Array.isArray(v)) { for (const row of v) for (const x of row) { if (typeof x === 'number' && isFinite(x)) out.push(x); } } else if (typeof v === 'number' && isFinite(v)) out.push(v); } return out; }
  function flat1(a) { const v = valOf(a); if (Array.isArray(v)) { const o = []; for (const r of v) for (const x of r) o.push(x); return o; } return [v]; }

  // ---- TEXT (Turkish formats) ----
  function excelText(value, fmt) {
    if (fmt == null) return String(value == null ? '' : value);
    fmt = String(fmt);
    // date formats: contains g/a/y (Turkish) or d/m/y
    if (/[gGaAyY]/.test(fmt) && /[.\/\-: ]/.test(fmt) && typeof value === 'number') return formatDate(value, fmt);
    // numeric
    if (/[#0]/.test(fmt)) return formatNumber(num(value), fmt);
    return String(value);
  }
  function formatDate(serial, fmt) {
    const t = serialToYMD(serial); const dd = t.d, mm = t.m, yy = t.y;
    const p2 = n => String(n).padStart(2, '0');
    // Turkish date codes (case-insensitive): gg/dd=gün, aa/mm=ay, yyyy/yy=yıl
    return fmt.replace(/yyyy|yy|gg|dd|aa|mm|[gay]/gi, tok => {
      const k = tok.toLowerCase();
      if (k === 'yyyy') return yy; if (k === 'yy') return String(yy).slice(-2);
      if (k === 'gg' || k === 'dd') return p2(dd); if (k === 'aa' || k === 'mm') return p2(mm);
      if (k === 'g' || k === 'd') return dd; if (k === 'a' || k === 'm') return mm; if (k === 'y') return yy;
      return tok;
    });
  }
  function formatNumber(n, fmt) {
    if (isNaN(n)) return '';
    const m = fmt.match(/[#0.,]+/); const core = m ? m[0] : '0';
    const suffix = fmt.slice((m ? m.index : 0) + core.length);
    const prefix = fmt.slice(0, m ? m.index : 0);
    let decimals = 0; const cm = core.match(/,(0+)$/) || core.match(/\.(0+)$/);
    // Turkish: '.' thousands, ',' decimal. decimals = digits after last ','
    const lastComma = core.lastIndexOf(','); const hasThousep = core.includes('.');
    if (lastComma >= 0) decimals = (core.length - lastComma - 1);
    const neg = n < 0; let v = Math.abs(n).toFixed(decimals);
    let [ip, dp] = v.split('.');
    if (hasThousep) ip = ip.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    let out = ip + (dp ? ',' + dp : '');
    return prefix + (neg ? '-' : '') + out + suffix;
  }

  // ---- date helpers (Excel serial, epoch 1899-12-30) ----
  const DAY_MS = 86400000, EPOCH = Date.UTC(1899, 11, 30);
  function serialToYMD(s) { s = Math.round(s); if (s === 0) return { y: 1900, m: 1, d: 0 }; const d = new Date(EPOCH + s * DAY_MS); return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() }; }
  function ymdToSerial(y, m, d) { return Math.round((Date.UTC(y, m - 1, d) - EPOCH) / DAY_MS); }
  function asSerial(x) { const v = valOf(x); if (v instanceof FormulaError) throw v; if (v == null || v === '') return 0; if (typeof v === 'number') return v; const n = parseNum(v); return isNaN(n) ? 0 : n; }
  function isLastDayOfFeb(y, m, d) { return m === 2 && d === new Date(Date.UTC(y, 2, 0)).getUTCDate(); }
  function days360(s1, s2, euro) {
    let a = serialToYMD(s1), b = serialToYMD(s2); let d1 = a.d, d2 = b.d;
    if (euro) { if (d1 === 31) d1 = 30; if (d2 === 31) d2 = 30; }
    else { // US/NASD
      if (isLastDayOfFeb(a.y, a.m, a.d) && isLastDayOfFeb(b.y, b.m, b.d)) d2 = 30;
      if (isLastDayOfFeb(a.y, a.m, a.d)) d1 = 30;
      if (d2 === 31 && (d1 === 30 || d1 === 31)) d2 = 30;
      if (d1 === 31) d1 = 30;
    }
    return (b.y - a.y) * 360 + (b.m - a.m) * 30 + (d2 - d1);
  }
  function wrapErr(fn) { return (...args) => { for (const a of args) { const v = valOf(a); if (v instanceof FormulaError) return v; } try { return fn(...args); } catch (e) { if (e instanceof FormulaError) return e; throw e; } }; }
  // collect boolean values for AND/OR: propagate errors (throw), coerce numbers/bools, ignore blank/text
  function boolVals(args) {
    const out = [];
    for (const a of args) {
      const v = valOf(a); const items = Array.isArray(v) ? v.flat(Infinity) : [v];
      for (const x of items) {
        if (x instanceof FormulaError) throw x;
        if (typeof x === 'boolean') out.push(x);
        else if (typeof x === 'number') out.push(x !== 0);
        else if (typeof x === 'string') { const u = x.toUpperCase(); if (u === 'TRUE' || u === 'DOĞRU') out.push(true); else if (u === 'FALSE' || u === 'YANLIŞ') out.push(false); }
      }
    }
    return out;
  }

  // ---- function set ----
  const functions = {
    DATE: wrapErr((y, m, d) => ymdToSerial(Math.trunc(num(valOf(y))), Math.trunc(num(valOf(m))), Math.trunc(num(valOf(d))))),
    YEAR: wrapErr((s) => serialToYMD(asSerial(s)).y),
    MONTH: wrapErr((s) => serialToYMD(asSerial(s)).m),
    DAY: wrapErr((s) => serialToYMD(asSerial(s)).d),
    DAYS360: wrapErr((s1, s2, method) => days360(asSerial(s1), asSerial(s2), method != null && !!valOf(method))),
    DAYS: wrapErr((e, s) => Math.round(asSerial(e) - asSerial(s))),
    EDATE: wrapErr((s, m) => { const t = serialToYMD(asSerial(s)); return ymdToSerial(t.y, t.m + Math.trunc(num(valOf(m))), t.d); }),
    EOMONTH: wrapErr((s, m) => { const t = serialToYMD(asSerial(s)); return ymdToSerial(t.y, t.m + Math.trunc(num(valOf(m))) + 1, 0); }),
    WEEKDAY: wrapErr((s, type) => { const w = (new Date(EPOCH + Math.round(asSerial(s)) * DAY_MS).getUTCDay()); const t = type == null ? 1 : Math.trunc(num(valOf(type))); if (t === 1) return w + 1; if (t === 2) return w === 0 ? 7 : w; if (t === 3) return w === 0 ? 6 : w - 1; return w + 1; }),
    YEARFRAC: wrapErr((s1, s2, basis) => { const a = asSerial(s1), b = asSerial(s2); const bs = basis == null ? 0 : Math.trunc(num(valOf(basis))); if (bs === 0) return days360(a, b, false) / 360; if (bs === 1) return Math.abs(b - a) / 365.25; if (bs === 2) return Math.abs(b - a) / 360; if (bs === 3) return Math.abs(b - a) / 365; return days360(a, b, true) / 360; }),
    TODAY: () => ymdToSerial(new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate()),
    // numeric funcs with Turkish-aware coercion ("0,01" -> 0.01); Excel-TR coerces text decimals
    ABS: wrapErr((x) => Math.abs(num(valOf(x)))),
    INT: wrapErr((x) => Math.floor(num(valOf(x)))),
    TRUNC: wrapErr((x, d) => { const f = Math.pow(10, d == null ? 0 : Math.trunc(num(valOf(d)))); return Math.trunc(num(valOf(x)) * f) / f; }),
    ROUND: wrapErr((x, d) => { const f = Math.pow(10, Math.trunc(num(valOf(d)))); const v = num(valOf(x)) * f; return (v < 0 ? -Math.round(-v) : Math.round(v)) / f; }),
    ROUNDUP: wrapErr((x, d) => { const f = Math.pow(10, Math.trunc(num(valOf(d)))); const v = num(valOf(x)) * f; return (v < 0 ? -Math.ceil(-v) : Math.ceil(v)) / f; }),
    ROUNDDOWN: wrapErr((x, d) => { const f = Math.pow(10, Math.trunc(num(valOf(d)))); const v = num(valOf(x)) * f; return (v < 0 ? -Math.floor(-v) : Math.floor(v)) / f; }),
    // AND/OR MUST propagate errors (Excel: AND(TRUE,#VALUE!)=#VALUE!). FFP's builtins ignore error args.
    AND: wrapErr((...args) => { const b = boolVals(args); return b.length ? b.every(Boolean) : ERR.VALUE; }),
    OR: wrapErr((...args) => { const b = boolVals(args); return b.length ? b.some(Boolean) : ERR.VALUE; }),
    NOT: wrapErr((x) => { const v = valOf(x); if (typeof v === 'number') return v === 0; if (typeof v === 'boolean') return !v; if (typeof v === 'string') { const u = v.toUpperCase(); if (u === 'TRUE' || u === 'DOĞRU') return false; if (u === 'FALSE' || u === 'YANLIŞ') return true; } return !v; }),
    MAX: (...a) => { const n = flatNums(a); return n.length ? Math.max(...n) : 0; },
    MIN: (...a) => { const n = flatNums(a); return n.length ? Math.min(...n) : 0; },
    SMALL: (arr, k) => { const n = flat1(arr).filter(x => typeof x === 'number' && isFinite(x)).sort((x, y) => x - y); const i = Math.trunc(valOf(k)) - 1; return (i >= 0 && i < n.length) ? n[i] : ERR.NUM; },
    LARGE: (arr, k) => { const n = flat1(arr).filter(x => typeof x === 'number' && isFinite(x)).sort((x, y) => y - x); const i = Math.trunc(valOf(k)) - 1; return (i >= 0 && i < n.length) ? n[i] : ERR.NUM; },
    VALUE: (t) => { const n = parseNum(valOf(t)); return isNaN(n) ? ERR.VALUE : n; },
    UPPER: (t) => String(valOf(t) == null ? '' : valOf(t)).replace(/i/g, 'İ').replace(/ı/g, 'I').toLocaleUpperCase('tr-TR'),
    TEXT: (v, f) => excelText(valOf(v), valOf(f)),
    SUBSTITUTE: (text, oldT, newT, inst) => {
      let s = String(valOf(text) == null ? '' : valOf(text)); const o = String(valOf(oldT)); const nw = String(valOf(newT) == null ? '' : valOf(newT));
      if (o === '') return s;
      if (inst == null || valOf(inst) == null) return s.split(o).join(nw);
      const k = Math.trunc(valOf(inst)); let cnt = 0, idx = 0, out = '';
      while (true) { const p = s.indexOf(o, idx); if (p === -1) { out += s.slice(idx); break; } cnt++; if (cnt === k) { out += s.slice(idx, p) + nw + s.slice(p + o.length); break; } out += s.slice(idx, p + o.length); idx = p + o.length; }
      return out;
    },
    SUMIFS: (...a) => {
      const sumArr = flat1(a[0]); const pairs = [];
      for (let i = 1; i + 1 < a.length; i += 2) pairs.push([flat1(a[i]), makeCriteria(valOf(a[i + 1]))]);
      let sum = 0; for (let j = 0; j < sumArr.length; j++) { let ok = true; for (const [cr, t] of pairs) if (!t(cr[j])) { ok = false; break; } if (ok && typeof sumArr[j] === 'number') sum += sumArr[j]; }
      return sum;
    },
    // array-aware COUNTIF/SUMIF: when the criteria is itself an array, return an array of results
    COUNTIF: (rangeArg, critArg) => {
      const list = flat1(rangeArg); const crit = valOf(critArg);
      if (crit instanceof FormulaError) return crit;
      const one = c => { if (c instanceof FormulaError) return 0; const t = makeCriteria(c); let n = 0; for (const x of list) if (t(x)) n++; return n; };
      return Array.isArray(crit) ? crit.map(row => Array.isArray(row) ? row.map(one) : one(row)) : one(crit);
    },
    SUMIF: (rangeArg, critArg, sumArg) => {
      const rlist = flat1(rangeArg); const slist = sumArg != null ? flat1(sumArg) : rlist; const crit = valOf(critArg);
      if (crit instanceof FormulaError) return crit;
      const one = c => { if (c instanceof FormulaError) return 0; const t = makeCriteria(c); let s = 0; for (let i = 0; i < rlist.length; i++) if (t(rlist[i]) && typeof slist[i] === 'number') s += slist[i]; return s; };
      return Array.isArray(crit) ? crit.map(row => Array.isArray(row) ? row.map(one) : one(row)) : one(crit);
    },
  };
  function critValue(s) {
    const n = parseNum(s); if (!isNaN(n) && String(s).trim() !== '') return n;
    const dm = /^(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})$/.exec(String(s).trim()); // dd/mm/yyyy (TR) -> serial
    if (dm) return ymdToSerial(+dm[3], +dm[2], +dm[1]);
    return s;
  }
  function makeCriteria(crit) {
    let op = '=', rhs = crit;
    if (typeof crit === 'string') { const m = /^(>=|<=|<>|>|<|=)?([\s\S]*)$/.exec(crit); op = m[1] || '='; rhs = critValue(m[2]); }
    return v => {
      if (op === '=') return typeof rhs === 'number' ? parseNum(v) === rhs : String(v == null ? '' : v).toLowerCase() === String(rhs).toLowerCase();
      if (op === '<>') return typeof rhs === 'number' ? parseNum(v) !== rhs : String(v == null ? '' : v).toLowerCase() !== String(rhs).toLowerCase();
      const an = parseNum(v), bn = typeof rhs === 'number' ? rhs : parseNum(rhs); if (isNaN(an) || isNaN(bn)) return false;
      return op === '>' ? an > bn : op === '<' ? an < bn : op === '>=' ? an >= bn : an <= bn;
    };
  }

  // ---- lazy lookup functions (receive raw refs); use ctx.position for current sheet ----
  const posSheetOf = (ctx) => ctx && ctx.position && ctx.position.sheet;
  // resolve the lookup key arg: may be a scalar, a cell ref {ref:{row,col}}, or range ref {ref:{from,to}}
  function keyVal(arg, ctx) {
    if (arg && typeof arg === 'object' && arg.ref) {
      const r = arg.ref; const sh = r.sheet || posSheetOf(ctx);
      const row = r.from ? r.from.row : r.row; const col = r.from ? r.from.col : r.col;
      return getVal(sh, row, col);
    }
    return valOf(arg);
  }
  function VLOOKUP(ctx, key, rangeRef, colIdx, approx) {
    const { sheet, from, to } = refToCells(rangeRef, posSheetOf(ctx));
    const exact = approx === false || approx === 0;
    const k = keyVal(key, ctx);
    const ci = Math.trunc(typeof colIdx === 'object' ? num(colIdx) : colIdx);
    const resCol = from.col + ci - 1;
    if (exact) {
      // Excel returns 0 (not blank/null) when the matched result cell is empty. FFP turns a
      // null function return into #NULL!, so coerce empty -> 0 here.
      for (let r = from.row; r <= to.row; r++) { const cv = getVal(sheet, r, from.col); if (eqExcel(cv, k)) { const rv = getVal(sheet, r, resCol); return rv == null ? 0 : rv; } }
      return ERR.NA;
    }
    let best = -1; for (let r = from.row; r <= to.row; r++) { const cv = getVal(sheet, r, from.col); if (typeof cv === 'number' && typeof k === 'number') { if (cv <= k) best = r; else break; } }
    return best >= 0 ? getVal(sheet, best, resCol) : ERR.NA;
  }
  function HLOOKUP(ctx, key, rangeRef, rowIdx, approx) {
    const { sheet, from, to } = refToCells(rangeRef, posSheetOf(ctx));
    const exact = approx === false || approx === 0;
    const k = keyVal(key, ctx);
    const ri = Math.trunc(typeof rowIdx === 'object' ? num(rowIdx) : rowIdx); const resRow = from.row + ri - 1;
    if (exact) { for (let c = from.col; c <= to.col; c++) { const cv = getVal(sheet, from.row, c); if (eqExcel(cv, k)) return getVal(sheet, resRow, c); } return ERR.NA; }
    let best = -1; for (let c = from.col; c <= to.col; c++) { const cv = getVal(sheet, from.row, c); if (typeof cv === 'number' && typeof k === 'number') { if (cv <= k) best = c; else break; } }
    return best >= 0 ? getVal(sheet, resRow, best) : ERR.NA;
  }
  // build a 1D list from a lookup arg: lazy ref-scan, OR a computed array value (array formulas)
  function listFromArg(arg, ctx) {
    if (arg && typeof arg === 'object' && arg.ref) {
      const { sheet, from, to } = refToCells(arg, posSheetOf(ctx));
      const out = []; const horiz = (to.row === from.row);
      if (horiz) for (let c = from.col; c <= to.col; c++) out.push(getVal(sheet, from.row, c));
      else for (let r = from.row; r <= to.row; r++) out.push(getVal(sheet, r, from.col));
      return out;
    }
    const v = valOf(arg);
    if (Array.isArray(v)) { const o = []; for (const row of v) for (const x of (Array.isArray(row) ? row : [row])) o.push(x); return o; }
    return [v];
  }
  function MATCH(ctx, key, rangeRef, type) {
    const k = keyVal(key, ctx);
    const t = (type == null) ? 1 : Math.trunc(typeof type === 'object' && type.ref == null ? num(type) : (type.ref ? num(keyVal(type, ctx)) : type));
    const cells = listFromArg(rangeRef, ctx);
    if (t === 0) { for (let i = 0; i < cells.length; i++) if (eqExcel(cells[i], k)) return i + 1; return ERR.NA; }
    if (t === 1) { let res = -1; for (let i = 0; i < cells.length; i++) { if (typeof cells[i] === 'number' && cells[i] <= k) res = i; else if (typeof cells[i] === 'number' && cells[i] > k) break; } return res >= 0 ? res + 1 : ERR.NA; }
    let res = -1; for (let i = 0; i < cells.length; i++) { if (typeof cells[i] === 'number' && cells[i] >= k) res = i; else break; } return res >= 0 ? res + 1 : ERR.NA;
  }
  function LOOKUP(ctx, key, vecRef, resRef) {
    const v = refToCells(vecRef, posSheetOf(ctx)); const k = keyVal(key, ctx);
    const horiz = (v.to.row === v.from.row); const len = horiz ? (v.to.col - v.from.col + 1) : (v.to.row - v.from.row + 1);
    let best = -1; for (let i = 0; i < len; i++) { const cv = horiz ? getVal(v.sheet, v.from.row, v.from.col + i) : getVal(v.sheet, v.from.row + i, v.from.col); if (typeof k === 'number' ? (typeof cv === 'number' && cv <= k) : (String(cv).toLowerCase() <= String(k).toLowerCase())) best = i; }
    if (best < 0) return ERR.NA;
    if (resRef) { const rr = refToCells(resRef, posSheetOf(ctx)); const rh = (rr.to.row === rr.from.row); return rh ? getVal(rr.sheet, rr.from.row, rr.from.col + best) : getVal(rr.sheet, rr.from.row + best, rr.from.col); }
    return horiz ? getVal(v.sheet, v.from.row, v.from.col + best) : getVal(v.sheet, v.from.row + best, v.from.col);
  }
  functions.VLOOKUP = VLOOKUP; functions.HLOOKUP = HLOOKUP; functions.MATCH = MATCH; functions.LOOKUP = LOOKUP;

  // chevrotain parsers are NOT re-entrant; lazy recursion via onCell triggers nested parse()
  // on the SAME instance and corrupts state. So keep a pool: one parser per recursion depth.
  const parserPool = [];
  function makeParser() {
    const p = new FormulaParser({
      functions,
      onCell: (ref) => getVal(ref.sheet, ref.row, ref.col),
      onRange: (ref) => { const out = []; for (let r = ref.from.row; r <= ref.to.row; r++) { const row = []; for (let c = ref.from.col; c <= ref.to.col; c++) row.push(getVal(ref.sheet, r, c)); out.push(row); } return out; },
    });
    for (const fn of ['VLOOKUP', 'HLOOKUP', 'MATCH', 'LOOKUP']) { p.funsNeedContextAndNoDataRetrieve.push(fn); p.funsNeedContext.push(fn); }
    // our custom SUMIF/COUNTIF take materialized values (array-aware); drop SUMIF from FFP's no-retrieve list
    p.funsNeedContextAndNoDataRetrieve = p.funsNeedContextAndNoDataRetrieve.filter(x => x !== 'SUMIF');
    p.funsNeedContext = p.funsNeedContext.filter(x => x !== 'SUMIF' && x !== 'AVERAGEIF');
    return p;
  }
  function getParser(depth) { if (!parserPool[depth]) parserPool[depth] = makeParser(); return parserPool[depth]; }

  function getByKey(key) { const i = key.lastIndexOf('!'); const s = key.slice(0, i), c = key.slice(i + 1); const m = /^([A-Z]+)(\d+)$/.exec(c); return getVal(s, +m[2], colToIdx(m[1]) + 1); }
  // Fixed-point iteration over cyclic cells (Excel-style iterative calc) until values stabilize.
  function sweepCycles(maxIter = 60, eps = 1e-7) {
    if (cyclic.size === 0) return 0;
    for (const k of cyclic) if (cache.has(k)) lastVal.set(k, cache.get(k));
    let it = 0;
    for (; it < maxIter; it++) {
      let maxDelta = 0;
      for (const key of cyclic) {
        const prev = lastVal.has(key) ? lastVal.get(key) : cache.get(key);
        cache.delete(key);
        const v = getByKey(key);
        lastVal.set(key, v);
        if (typeof v === 'number' && typeof prev === 'number') { const d = Math.abs(v - prev); if (d > maxDelta) maxDelta = d; }
        else if (v !== prev) maxDelta = Math.max(maxDelta, 1);
      }
      if (maxDelta < eps) { it++; break; }
    }
    return it;
  }
  function get(ref) { const [s, c] = ref.split('!'); const m = /^([A-Z]+)(\d+)$/.exec(c); return getVal(s, +m[2], colToIdx(m[1]) + 1); }
  // solve = full lazy eval of target, then iterate cycles to convergence, then return target
  function solve(ref, maxIter = 60) { get(ref); const iters = sweepCycles(maxIter); cache.delete(refKey(ref)); return { value: get(ref), iters, cyclic: cyclic.size }; }
  function refKey(ref) { return ref; }
  function setInput(ref, value) { overrides.set(ref, value); }
  function setMaxHizRow(n) { maxHizRow = Math.min(hizCap, Math.max(60, n)); cache.clear(); lastVal.clear(); inProgress.clear(); cyclic.clear(); }
  function reset() { cache.clear(); lastVal.clear(); overrides.clear(); inProgress.clear(); cyclic.clear(); stack = []; stats.evaluated = 0; stats.backEdges = 0; stats.errors = {}; stats.errEx = {}; maxHizRow = opts.maxHizRow ?? hizCap; }

  return { get, getVal, getByKey, solve, sweepCycles, setInput, setMaxHizRow, reset, stats, cyclic, lastVal, book };
}

export { createEngine, colToIdx };

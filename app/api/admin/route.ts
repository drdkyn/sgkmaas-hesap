import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
// @ts-ignore
import { loadParams, saveParams, readCell } from '../../../lib/sgk.mjs';
// @ts-ignore
import {
  mergeGroupWithYearlyExtras,
  mergeGroupWithCustomExtras,
  loadParamsRows,
  addYearlyRow,
  addCustomRow,
  cellRef,
  nextFreeRow,
  yearToRow,
} from '../../../lib/native/admin-rows.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function catalog() {
  const p = path.join(process.cwd(), 'data', 'params-catalog.json');
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function enrichGroup(g: any) {
  let grup = g;
  if (g.rowSchema?.tip === 'yearly') grup = mergeGroupWithYearlyExtras(g);
  else if (g.rowSchema?.tip === 'custom') grup = mergeGroupWithCustomExtras(g);
  const overrides = loadParams();
  for (const pr of grup.params) {
    pr.varsayilan = readCell(pr.ref);
    pr.override = overrides[pr.ref] ?? (pr.dinamik ? pr.override : '') ?? '';
  }
  return grup;
}

export async function GET() {
  try {
    const cat = catalog();
    cat.gruplar = cat.gruplar.map(enrichGroup);
    return NextResponse.json(cat);
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const cur = loadParams();

    if (body.edits && typeof body.edits === 'object') {
      for (const [ref, val] of Object.entries(body.edits)) {
        if (val === '' || val === null || val === undefined) delete cur[ref];
        else cur[ref as string] = val;
      }
    } else if (!body.addYearly && !body.addCustom) {
      for (const [ref, val] of Object.entries(body)) {
        if (val === '' || val === null || val === undefined) delete cur[ref];
        else cur[ref as string] = val;
      }
    }

    // Yeni yıllık satır (TÜFE, GH, PEK, …) — formül Emekli Maaşı H{sütun} otomatik okur
    if (Array.isArray(body.addYearly)) {
      for (const item of body.addYearly) {
        const { col, yil, deger } = item as { col: string; yil: number; deger: number };
        const refs = addYearlyRow(col, yil, deger);
        if (refs) Object.assign(cur, refs);
      }
    }

    // Serbest satır (zam oranı, alt sınır dönemi)
    if (Array.isArray(body.addCustom)) {
      for (const item of body.addCustom) {
        const { grupId, label, col, row, deger } = item as {
          grupId: string; label: string; col: string; row: number; deger: number;
        };
        const ref = cellRef('Veri Girişi', col, row);
        const refs = { [ref]: deger };
        addCustomRow(grupId, label, refs);
        cur[ref] = deger;
      }
    }

    saveParams(cur);
    return NextResponse.json({ ok: true, count: Object.keys(cur).length });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}

// Sonraki boş satır (custom grup için)
export async function PUT(req: Request) {
  try {
    const { col, minRow, maxRow, usedRefs } = await req.json();
    const used = new Set<number>();
    for (const ref of usedRefs || []) {
      const m = /!([A-Z]+)(\d+)$/.exec(ref);
      if (m && m[1] === col) used.add(+m[2]);
    }
    const row = nextFreeRow(col, used, minRow || 4, maxRow || 25);
    if (!row) return NextResponse.json({ error: 'Satır limiti doldu' }, { status: 400 });
    return NextResponse.json({ row, ref: cellRef('Veri Girişi', col, row) });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}

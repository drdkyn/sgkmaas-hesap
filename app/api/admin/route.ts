import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
// @ts-ignore
import { loadParams, saveParams, readCell } from '../../../lib/sgk.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function catalog() {
  const p = path.join(process.cwd(), 'data', 'params-catalog.json');
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

export async function GET() {
  try {
    const cat = catalog();
    const overrides = loadParams();
    // attach current (default) + override value to each param
    for (const g of cat.gruplar)
      for (const pr of g.params) {
        pr.varsayilan = readCell(pr.ref);
        pr.override = overrides[pr.ref] ?? '';
      }
    return NextResponse.json(cat);
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json(); // { "Sheet!Coord": value, ... }  ("" -> remove override)
    const cur = loadParams();
    for (const [ref, val] of Object.entries(body)) {
      if (val === '' || val === null || val === undefined) delete cur[ref];
      else cur[ref] = val;
    }
    saveParams(cur);
    return NextResponse.json({ ok: true, count: Object.keys(cur).length });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}

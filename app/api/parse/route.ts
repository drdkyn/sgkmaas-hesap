import { NextResponse } from 'next/server';
// @ts-ignore
import { parseHizmet, parseKisi } from '../../../lib/parse-hizmet.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Lightweight: parse pasted/PDF Hizmet Dökümü text into rows (no engine). The client shows these
// in an editable table so the user can review/enter Giriş & Çıkış Tarihi (which affect çakışma),
// then submits the edited rows to /api/hesapla.
export async function POST(req: Request) {
  try {
    const { hizmetText } = await req.json();
    const rows = (typeof hizmetText === 'string' && hizmetText.trim()) ? parseHizmet(hizmetText) : [];
    if (!rows.length) return NextResponse.json({ error: 'Hizmet dökümü tablosu okunamadı. Lütfen tabloyu (Ctrl+A, Ctrl+C) kopyalayıp yapıştırın.' }, { status: 400 });
    const kisi = parseKisi(hizmetText);
    return NextResponse.json({ rows, kisi });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}

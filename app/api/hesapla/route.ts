import { NextResponse } from 'next/server';
// @ts-ignore - JS module
import { hesapla } from '../../../lib/sgk.mjs';
// @ts-ignore - JS module
import { parseHizmet } from '../../../lib/parse-hizmet.mjs';

export const runtime = 'nodejs';
export const maxDuration = 120;
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json(hesapla({})); // seed örneği
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const inputs: any = { ...body };
    if (typeof body.hizmetText === 'string' && body.hizmetText.trim()) {
      inputs.hizmetRows = parseHizmet(body.hizmetText);
    }
    if (Array.isArray(inputs.hizmetRows) && inputs.hizmetRows.length === 0) {
      return NextResponse.json({ error: 'Hizmet dökümü tablosu okunamadı. Lütfen tabloyu (Ctrl+A, Ctrl+C) kopyalayıp yapıştırın.' }, { status: 400 });
    }
    const result = hesapla(inputs);
    result.satirSayisi = Array.isArray(inputs.hizmetRows) ? inputs.hizmetRows.length : null;
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}

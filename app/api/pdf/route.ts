import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const fd = await req.formData();
    const file = fd.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'Dosya bulunamadı' }, { status: 400 });
    const buf = new Uint8Array(await file.arrayBuffer());

    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: buf });
    const out = await parser.getText();
    // Prefer table-like extraction if available; fall back to plain text.
    const text: string = (out && (out.text ?? '')) || '';
    return NextResponse.json({ text });
  } catch (e: any) {
    return NextResponse.json({ error: 'PDF okunamadı: ' + String(e?.message || e) }, { status: 500 });
  }
}

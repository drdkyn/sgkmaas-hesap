import { NextResponse } from 'next/server';
// @ts-ignore
import { parseHizmet, parseKisi, parseSgkOzet } from '../../../lib/parse-hizmet.mjs';
// @ts-ignore
import { hesaplaPogs } from '../../../lib/native/pogs.mjs';

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
    const ozet = parseSgkOzet(hizmetText);
    const pogs = hesaplaPogs(rows);
    let uyari = '';
    if (ozet.toplam != null && ozet.toplam !== pogs) {
      const fark = ozet.toplam - pogs;
      uyari = `SGK özeti ${ozet.toplam} gün (${ozet.toplam4a} 4a + ${ozet.toplam4c} 4c) gösteriyor; çözümlenen tablo ${pogs} gün. ${Math.abs(fark)} gün ${fark > 0 ? 'eksik' : 'fazla'}. PDF yüklemeyi deneyin veya 4a bölümünün tam kopyalandığından emin olun.`;
    }
    return NextResponse.json({ rows, kisi, pogs, sgkOzet: ozet, uyari: uyari || undefined });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}

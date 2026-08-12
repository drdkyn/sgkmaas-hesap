import { NextResponse } from 'next/server';
import { spawn } from 'node:child_process';
import path from 'node:path';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

// pdf-parse ayrı bir process'te çalışır (bkz. lib/pdf-worker.mjs yorumu).
function runWorker(base64: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const worker = path.join(process.cwd(), 'lib', 'pdf-worker.mjs');
    const child = spawn(process.execPath, ['--max-old-space-size=2048', worker], { windowsHide: true });
    let out = '', err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', reject);
    child.on('close', (code) => {
      try { resolve(JSON.parse(out)); }
      catch { reject(new Error(err.trim() || `PDF süreci başarısız (kod ${code})`)); }
    });
    child.stdin.write(base64);
    child.stdin.end();
  });
}

export async function POST(req: Request) {
  try {
    const fd = await req.formData();
    const file = fd.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'Dosya bulunamadı' }, { status: 400 });
    const buf = Buffer.from(await file.arrayBuffer());
    const result = await runWorker(buf.toString('base64'));
    if (result && result.error) return NextResponse.json(result, { status: 500 });
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: 'PDF okunamadı: ' + String(e?.message || e) }, { status: 500 });
  }
}

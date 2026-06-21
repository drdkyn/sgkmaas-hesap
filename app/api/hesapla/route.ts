import { NextResponse } from 'next/server';
import { spawn } from 'node:child_process';
import path from 'node:path';

export const runtime = 'nodejs';
export const maxDuration = 120;
export const dynamic = 'force-dynamic';

// Run the calculation in a fresh plain-Node child process (see lib/calc-worker.mjs):
// Next's bundler deoptimizes the engine ~15x, and a per-request process leaves no PII behind.
function runWorker(payload: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const worker = path.join(process.cwd(), 'lib', 'calc-worker.mjs');
    const child = spawn(process.execPath, ['--max-old-space-size=4096', worker], { windowsHide: true });
    let out = '', err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', reject);
    child.on('close', (code) => {
      try { resolve(JSON.parse(out)); }
      catch { reject(new Error(err.trim() || `Hesap süreci başarısız (kod ${code})`)); }
    });
    child.stdin.write(JSON.stringify(payload ?? {}));
    child.stdin.end();
  });
}

export async function GET() {
  try {
    return NextResponse.json(await runWorker({})); // seed örneği
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const result = await runWorker(body);
    if (result && result.error) return NextResponse.json(result, { status: 400 });
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}

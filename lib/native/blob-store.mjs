// Vercel serverless fonksiyonlarında dosya sistemi salt-okunur (sadece /tmp yazılabilir,
// o da kalıcı değil, her container'da sıfırlanabilir). Admin panelinden kaydedilen
// override'ların kalıcı olması için Vercel Blob'u kaynak-of-truth olarak kullanıyoruz;
// /tmp sadece o çalışma anındaki hızlı senkron okuma için bir önbellek.
import fs from 'fs';
import os from 'os';
import path from 'path';
import { head, put } from '@vercel/blob';

const hydrated = new Set();

export function tmpPath(filename) {
  return path.join(os.tmpdir(), `sgkmaas-${filename}`);
}

export async function hydrateFromBlob(key, localPath) {
  const status = { key, tokenPresent: !!process.env.BLOB_READ_WRITE_TOKEN, ok: false, error: null };
  if (hydrated.has(key)) { status.ok = true; status.cached = true; return status; }
  hydrated.add(key);
  if (!status.tokenPresent) return status;
  try {
    const info = await head(key);
    const res = await fetch(info.url, { cache: 'no-store' });
    if (res.ok) {
      fs.writeFileSync(localPath, await res.text(), 'utf8');
      status.ok = true;
    } else {
      status.error = `fetch failed: HTTP ${res.status}`;
    }
  } catch (e) {
    // Blob'da henüz kayıt yok (ilk çalıştırma) ya da geçici hata — paketlenmiş varsayılana düşülür.
    status.error = String((e && e.stack) || e);
  }
  return status;
}

export async function persistToBlob(key, obj) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return;
  try {
    await put(key, JSON.stringify(obj, null, 2), {
      access: 'public',
      contentType: 'application/json',
      addRandomSuffix: false,
      allowOverwrite: true,
    });
  } catch {
    // Blob store bağlı değilse (yerel geliştirme) sessizce atla; veri en azından /tmp veya
    // repo dosyasında kalır.
  }
}

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

// Dashboard'a token yapıştırılırken kazara satır sonu/boşluk eklenmesi (kopyala-yapıştır
// hatası) undici'nin header validasyonunu kırıyor — token'ı açıkça trim'leyip SDK'ya öyle
// veriyoruz, zero-config process.env okumasına güvenmek yerine.
function blobToken() {
  const t = process.env.BLOB_READ_WRITE_TOKEN;
  return t ? t.trim() : undefined;
}

export async function hydrateFromBlob(key, localPath) {
  if (hydrated.has(key)) return;
  hydrated.add(key);
  const token = blobToken();
  if (!token) return;
  try {
    const info = await head(key, { token });
    const res = await fetch(info.url, { cache: 'no-store' });
    if (res.ok) fs.writeFileSync(localPath, await res.text(), 'utf8');
  } catch {
    // Blob'da henüz kayıt yok (ilk çalıştırma) ya da geçici hata — paketlenmiş varsayılana düşülür.
  }
}

/** @returns {Promise<{ok: boolean, reason?: string}>} — çağıran tarafın (admin UI) kalıcılığı
 * doğrulayabilmesi için basit bir durum döner; asıl akışı bozmaz (hata fırlatmaz). */
export async function persistToBlob(key, obj) {
  const token = blobToken();
  if (!token) return { ok: false, reason: 'no-token' };
  try {
    await put(key, JSON.stringify(obj, null, 2), {
      access: 'public',
      contentType: 'application/json',
      addRandomSuffix: false,
      allowOverwrite: true,
      token,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: String((e && e.message) || e) };
  }
}

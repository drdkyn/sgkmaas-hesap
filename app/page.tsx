'use client';
import { useState } from 'react';

function tl(n: any) {
  const x = typeof n === 'number' ? n : Number(n);
  if (!isFinite(x)) return '-';
  return x.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₺';
}
const temizAd = (s: string) => String(s || '').replace(/[,]+/g, ' ').replace(/\s+/g, ' ').trim();
const olur = (s: string) => /emekli olur/i.test(s || '');
// gg.aa.yyyy maskesi: rakamları al, gruplar arasına nokta koy. Nokta yalnız ardında rakam
// varken durur → backspace ile doğal/kolayca silinir (yapışkan nokta yok).
function maskDate(s: string) {
  const d = String(s || '').replace(/\D/g, '').slice(0, 8);
  const parts: string[] = [];
  if (d.length > 0) parts.push(d.slice(0, 2));
  if (d.length > 2) parts.push(d.slice(2, 4));
  if (d.length > 4) parts.push(d.slice(4, 8));
  return parts.join('.');
}

export default function Home() {
  const [hizmetText, setHizmetText] = useState('');
  const [dogumTarihi, setDogum] = useState('');
  const [cinsiyet, setCinsiyet] = useState('');
  const [tahsisTarihi, setTahsis] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [res, setRes] = useState<any>(null);
  const [pdfBusy, setPdfBusy] = useState(false);

  async function hesapla() {
    setLoading(true); setErr(''); setRes(null);
    try {
      const r = await fetch('/api/hesapla', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hizmetText, dogumTarihi, cinsiyet, tahsisTarihi }),
      });
      const data = await r.json();
      if (!r.ok) setErr(data.error || 'Hesaplama hatası'); else setRes(data);
    } catch (e: any) { setErr(String(e?.message || e)); }
    finally { setLoading(false); }
  }

  async function pdfYukle(file: File) {
    setPdfBusy(true); setErr('');
    try {
      const fd = new FormData(); fd.append('file', file);
      const r = await fetch('/api/pdf', { method: 'POST', body: fd });
      const data = await r.json();
      if (!r.ok) setErr(data.error || 'PDF okunamadı');
      else { setHizmetText(data.text || ''); }
    } catch (e: any) { setErr(String(e?.message || e)); }
    finally { setPdfBusy(false); }
  }

  return (
    <div className="wrap">
      <h1>SGK Emeklilik & Maaş Hesaplama</h1>
      <div className="sub">Hizmet Dökümünüzü yapıştırın veya PDF yükleyin; emeklilik şartlarınızı ve bağlanacak maaşı hesaplayın. &nbsp;<a href="/admin" style={{ color: '#0f766e' }}>⚙️ Parametre Yönetimi</a></div>

      <div className="card">
        <h2>1) Hizmet Dökümü</h2>
        <p className="sub" style={{ marginBottom: 10 }}>
          SGK/e-Devlet hizmet dökümü tablosunu seçin (<b>Ctrl+A</b>), kopyalayın (<b>Ctrl+C</b>) ve aşağıya yapıştırın (<b>Ctrl+V</b>). Veya PDF yükleyin.
        </p>
        <textarea
          value={hizmetText} onChange={e => setHizmetText(e.target.value)}
          placeholder="Hizmet dökümü tablosunu buraya yapıştırın…"
          rows={8} style={{ width: '100%', fontFamily: 'monospace', fontSize: 12, padding: 10, border: '1px solid #cbd5e1', borderRadius: 8 }}
        />
        <div style={{ marginTop: 10 }}>
          <label className="btn-file">
            {pdfBusy ? 'PDF okunuyor…' : '📄 PDF yükle'}
            <input type="file" accept="application/pdf" style={{ display: 'none' }}
              onChange={e => e.target.files?.[0] && pdfYukle(e.target.files[0])} />
          </label>
        </div>
      </div>

      <div className="card">
        <h2>2) Kişi Bilgileri (opsiyonel)</h2>
        <div className="grid">
          <div><label className="lbl">Doğum Tarihi</label><input className="inp" placeholder="gg.aa.yyyy" inputMode="numeric" maxLength={10} value={dogumTarihi} onChange={e => setDogum(maskDate(e.target.value))} /></div>
          <div><label className="lbl">Cinsiyet</label>
            <select className="inp" value={cinsiyet} onChange={e => setCinsiyet(e.target.value)}>
              <option value="">—</option><option value="E">Erkek</option><option value="K">Kadın</option>
            </select>
          </div>
          <div><label className="lbl">Tahsis / Hesap Tarihi</label><input className="inp" placeholder="gg.aa.yyyy" inputMode="numeric" maxLength={10} value={tahsisTarihi} onChange={e => setTahsis(maskDate(e.target.value))} /></div>
        </div>
      </div>

      <button className="hesapla-btn" onClick={hesapla} disabled={loading}>
        {loading ? 'Hesaplanıyor… (20-30 sn sürebilir)' : 'HESAPLA'}
      </button>

      {err && <div className="note" style={{ background: '#fee2e2', borderColor: '#fca5a5', color: '#b91c1c' }}>{err}</div>}

      {res && (
        <>
          <div className="card">
            <h2>Bağlanacak Aylık (Maaş)</h2>
            <div className="maas">{tl(res.maasToplam)}</div>
            <div className="sub">Aylık: {tl(res.maasAylik)} · Ek Ödeme: {tl(res.maasEkOdeme)} {res.satirSayisi ? `· ${res.satirSayisi} hizmet kaydı` : ''}</div>
          </div>
          <div className="card">
            <h2>Hizmet Durumu</h2>
            <div className="grid">
              <div className="kv"><div className="k">Prim Ödeme Gün Sayısı</div><div className="v">{res.primGunSayisi}</div></div>
              <div className="kv"><div className="k">Sigortalılık Süresi (yıl)</div><div className="v">{res.sigortalilikSuresi}</div></div>
              {Number(res.cakisanHizmet) < 0 && (
                <div className="kv"><div className="k">Çakışan Hizmet (düşülen gün)</div><div className="v">{Math.abs(Number(res.cakisanHizmet))}</div></div>
              )}
            </div>
            {Number(res.cakisanHizmet) < 0 && (
              <>
                <div className="sub" style={{ marginTop: 8 }}>
                  Aynı aya denk gelen hizmetlerden toplam {Math.abs(Number(res.cakisanHizmet))} gün çakışan hizmet olarak düşülmüştür; prim gün sayısı bu düşüm sonrası net değerdir.
                </div>
                {Array.isArray(res.cakisanDetay) && res.cakisanDetay.length > 0 && (
                  <table style={{ marginTop: 10 }}>
                    <thead><tr><th>Çakışan Dönem</th><th>Düşülen Gün</th></tr></thead>
                    <tbody>
                      {Object.entries(
                        res.cakisanDetay.reduce((acc: Record<string, number>, d: any) => {
                          const k = String(d.donem || '—'); acc[k] = (acc[k] || 0) + Math.abs(Number(d.gun) || 0); return acc;
                        }, {})
                      ).sort((a, b) => a[0].localeCompare(b[0])).map(([donem, gun], i) => (
                        <tr key={i}><td>{donem}</td><td>{gun as number}</td></tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </>
            )}
          </div>
          {res.statu && res.statu.belirlenen && (
            <div className="card">
              <h2>Statü Kontrolü</h2>
              <div className="grid">
                <div className="kv"><div className="k">Emekli olunacak statü</div><div className="v">{res.statu.belirlenen}</div></div>
              </div>
              <div className="sub" style={{ marginTop: 8 }}>{res.statu.kural}</div>
              {res.statu.toplamDagilim && Object.keys(res.statu.toplamDagilim).length > 1 && (
                <table style={{ marginTop: 10 }}>
                  <thead><tr><th>Statü</th><th>Toplam Gün</th></tr></thead>
                  <tbody>
                    {Object.entries(res.statu.toplamDagilim).sort((a, b) => (b[1] as number) - (a[1] as number)).map(([st, gun], i) => (
                      <tr key={i}><td>{st}</td><td>{gun as number}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
          <div className="card">
            <h2>Emeklilik Şartları</h2>
            <table>
              <thead><tr><th>Tür</th><th>Süre</th><th>Yaş</th><th>Gün</th><th>Sonuç</th></tr></thead>
              <tbody>
                {(res.senaryolar || []).map((s: any, i: number) => (
                  <tr key={i}>
                    <td>{temizAd(s.ad)}</td><td>{s.sure}</td><td>{s.yas}</td><td>{s.gun}</td>
                    <td><span className={`tag ${olur(s.sonuc) ? 'ok' : 'no'}`}>{s.sonuc || '-'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

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
// Excel seri no <-> gg.aa.yyyy (epoch 1899-12-30, parse-hizmet.mjs ile aynı)
const EPOCH = Date.UTC(1899, 11, 30), DAY = 86400000;
function serialToDate(v: any): string {
  const n = typeof v === 'number' ? v : Number(v);
  if (!isFinite(n) || n <= 0) return '';
  const d = new Date(EPOCH + n * DAY);
  const gg = String(d.getUTCDate()).padStart(2, '0');
  const aa = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${gg}.${aa}.${d.getUTCFullYear()}`;
}
function dateToSerial(s: string): number | '' {
  const m = /^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})$/.exec(String(s || '').trim());
  if (!m) return '';
  return Math.round((Date.UTC(+m[3], +m[2] - 1, +m[1]) - EPOCH) / DAY);
}

type Row = Record<string, any>;

export default function Home() {
  const [hizmetText, setHizmetText] = useState('');
  const [rows, setRows] = useState<Row[] | null>(null); // çözümlenmiş & düzenlenebilir dönemler
  const [dogumTarihi, setDogum] = useState('');
  const [cinsiyet, setCinsiyet] = useState('');
  const [tahsisTarihi, setTahsis] = useState('');
  const [loading, setLoading] = useState(false);
  const [parseBusy, setParseBusy] = useState(false);
  const [err, setErr] = useState('');
  const [res, setRes] = useState<any>(null);
  const [pdfBusy, setPdfBusy] = useState(false);

  // Dökümü çözümle → düzenlenebilir tabloya yükle (Giriş/Çıkış Tarihi gg.aa.yyyy olarak)
  async function cozumle() {
    setParseBusy(true); setErr(''); setRes(null);
    try {
      const r = await fetch('/api/parse', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hizmetText }),
      });
      const data = await r.json();
      if (!r.ok) { setErr(data.error || 'Çözümlenemedi'); return; }
      const ed = (data.rows as Row[]).map(rw => ({ ...rw, _giris: serialToDate(rw.M), _cikis: serialToDate(rw.O) }));
      setRows(ed);
    } catch (e: any) { setErr(String(e?.message || e)); }
    finally { setParseBusy(false); }
  }

  function setRowDate(i: number, key: '_giris' | '_cikis', val: string) {
    setRows(rs => rs ? rs.map((r, j) => j === i ? { ...r, [key]: maskDate(val) } : r) : rs);
  }

  async function hesapla() {
    setLoading(true); setErr(''); setRes(null);
    try {
      // Düzenlenmiş satırlar varsa onları gönder (Giriş/Çıkış tarihleri serie çevrilir);
      // yoksa ham metni gönder (sunucu parse eder).
      let body: any = { dogumTarihi, cinsiyet, tahsisTarihi };
      if (rows && rows.length) {
        body.hizmetRows = rows.map(({ _giris, _cikis, ...rw }) => ({
          ...rw,
          M: dateToSerial(_giris) === '' ? '' : dateToSerial(_giris),
          O: dateToSerial(_cikis) === '' ? '' : dateToSerial(_cikis),
        }));
      } else {
        body.hizmetText = hizmetText;
      }
      const r = await fetch('/api/hesapla', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
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
      else { setHizmetText(data.text || ''); setRows(null); }
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
          value={hizmetText} onChange={e => { setHizmetText(e.target.value); setRows(null); }}
          placeholder="Hizmet dökümü tablosunu buraya yapıştırın…"
          rows={8} style={{ width: '100%', fontFamily: 'monospace', fontSize: 12, padding: 10, border: '1px solid #cbd5e1', borderRadius: 8 }}
        />
        <div style={{ marginTop: 10, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <label className="btn-file">
            {pdfBusy ? 'PDF okunuyor…' : '📄 PDF yükle'}
            <input type="file" accept="application/pdf" style={{ display: 'none' }}
              onChange={e => e.target.files?.[0] && pdfYukle(e.target.files[0])} />
          </label>
          <button className="btn-file" onClick={cozumle} disabled={parseBusy || !hizmetText.trim()}>
            {parseBusy ? 'Çözümleniyor…' : '🔍 Çözümle ve Çıkış Tarihlerini Düzenle'}
          </button>
        </div>
      </div>

      {rows && rows.length > 0 && (
        <div className="card">
          <h2>1b) Dönemler — Giriş / Çıkış Tarihleri</h2>
          <p className="sub" style={{ marginBottom: 10 }}>
            Aşağıdaki <b>{rows.length}</b> dönem çözümlendi. <b>Çıkış Tarihi</b> aynı aya denk gelen hizmetlerde
            çakışma hesabını (ve dolayısıyla prim gününü/maaşı) etkiler. Dökümde çıkış tarihi yoksa burada girin/düzeltin
            (boş bırakılırsa ilgili ayın sonu varsayılır).
          </p>
          <div style={{ overflowX: 'auto', maxHeight: 420, overflowY: 'auto' }}>
            <table style={{ fontSize: 12 }}>
              <thead><tr>
                <th>#</th><th>Dönem</th><th>Statü</th><th>Belge</th><th>Gün</th><th>Kazanç</th>
                <th>Giriş Tarihi</th><th>Çıkış Tarihi</th>
              </tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td style={{ color: '#94a3b8' }}>{i + 1}</td>
                    <td>{String(r.H ?? '')}</td>
                    <td>{String(r.A ?? '')}</td>
                    <td>{String(r.J ?? '')}</td>
                    <td>{String(r.K ?? '')}</td>
                    <td>{String(r.L ?? '')}</td>
                    <td><input className="inp" style={{ width: 110, fontSize: 12, padding: '4px 6px' }}
                      placeholder="gg.aa.yyyy" inputMode="numeric" maxLength={10}
                      value={r._giris} onChange={e => setRowDate(i, '_giris', e.target.value)} /></td>
                    <td><input className="inp" style={{ width: 110, fontSize: 12, padding: '4px 6px' }}
                      placeholder="gg.aa.yyyy" inputMode="numeric" maxLength={10}
                      value={r._cikis} onChange={e => setRowDate(i, '_cikis', e.target.value)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

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
              {Array.isArray(res.statu.statuler) && (
                <table style={{ marginTop: 10 }}>
                  <thead><tr><th>Statü</th><th>{res.statu.basisAd} Gün (belirleyici)</th><th>Toplam Gün</th></tr></thead>
                  <tbody>
                    {res.statu.statuler.map((s: any, i: number) => (
                      <tr key={i} style={s.ad === res.statu.belirlenen ? { fontWeight: 700 } : undefined}>
                        <td>{s.ad}{s.ad === res.statu.belirlenen ? ' ✓' : ''}</td>
                        <td>{s.belirleyici}</td>
                        <td>{s.toplam}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {Number(res.statu.gerekenDaha) > 0 && (
                <div className="sub" style={{ marginTop: 8 }}>
                  Statünün <b>{res.statu.hedefAd}</b> olması için {res.statu.hedefAd}'nın {res.statu.basisAd.toLowerCase()} içinde en az <b>{res.statu.esik} gün</b> olması gerekir (şu an {res.statu.hedefMevcut}); yani <b>{res.statu.gerekenDaha} gün</b> daha.
                </div>
              )}
            </div>
          )}
          <div className="card">
            <h2>4a Emeklilik Şartları</h2>
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

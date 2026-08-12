'use client';
import { useEffect, useState } from 'react';

type Grup = {
  baslik: string;
  aciklama?: string;
  eklenebilir?: boolean;
  rowSchema?: { tip: string; col: string; etiket?: string; minRow?: number; maxRow?: number };
  params: { ref: string; label: string; varsayilan: unknown; override: string; dinamik?: boolean }[];
};

export default function Admin() {
  const [gruplar, setGruplar] = useState<Grup[]>([]);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const r = await fetch('/api/admin');
    const d = await r.json();
    setGruplar(d.gruplar || []);
    setEdits({});
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function kaydet() {
    setMsg('Kaydediliyor…');
    const r = await fetch('/api/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ edits }),
    });
    const d = await r.json();
    setMsg(r.ok ? `Kaydedildi (${d.count} özel değer aktif).` : 'Hata: ' + d.error);
    load();
  }

  async function yilEkle(g: Grup) {
    const rs = g.rowSchema;
    if (!rs || rs.tip !== 'yearly') return;
    const yilStr = prompt('Yıl (ör. 2034):');
    if (!yilStr) return;
    const yil = Number(yilStr);
    if (!yil || yil < 1990 || yil > 2100) { alert('Geçersiz yıl'); return; }
    const degerStr = prompt(`${yil} ${rs.etiket || rs.col} değeri:`);
    if (degerStr === null || degerStr === '') return;
    const deger = Number(String(degerStr).replace(',', '.'));
    if (Number.isNaN(deger)) { alert('Geçersiz sayı'); return; }
    setMsg('Ekleniyor…');
    const r = await fetch('/api/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ addYearly: [{ col: rs.col, yil, deger }] }),
    });
    const d = await r.json();
    setMsg(r.ok ? `${yil} eklendi ve kaydedildi.` : 'Hata: ' + d.error);
    load();
  }

  async function satirEkle(g: Grup) {
    const rs = g.rowSchema;
    if (!rs || rs.tip !== 'custom') return;
    const usedRefs = g.params.map(p => p.ref);
    const pr = await fetch('/api/admin', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ col: rs.col, minRow: rs.minRow, maxRow: rs.maxRow, usedRefs }),
    });
    const slot = await pr.json();
    if (!pr.ok) { alert(slot.error || 'Satır eklenemedi'); return; }
    const label = prompt('Dönem açıklaması (ör. 01.01.2027–30.06.2027):', `Yeni dönem (${rs.col}${slot.row})`);
    if (!label) return;
    const degerStr = prompt(`${label} — değer:`);
    if (degerStr === null || degerStr === '') return;
    const deger = Number(String(degerStr).replace(',', '.'));
    if (Number.isNaN(deger)) { alert('Geçersiz sayı'); return; }
    const r = await fetch('/api/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        addCustom: [{ grupId: g.baslik, label, col: rs.col, row: slot.row, deger }],
      }),
    });
    const d = await r.json();
    setMsg(r.ok ? 'Satır eklendi.' : 'Hata: ' + d.error);
    load();
  }

  if (loading) return <div className="wrap"><p>Yükleniyor…</p></div>;

  return (
    <div className="wrap">
      <h1>Parametre Yönetimi (Admin)</h1>
      <div className="sub">
        Periyodik güncellenen değerleri buradan değiştirin. Yıllık parametrelerde &quot;+ Yıl ekle&quot; ile
        yeni satır ekleyebilirsiniz — motor formülleri Veri Girişi hücresini otomatik okur.
      </div>

      {gruplar.map((g, gi) => (
        <div className="card" key={gi}>
          <h2>{g.baslik}</h2>
          {g.aciklama && <div className="sub" style={{ marginTop: -4, marginBottom: 10 }}>{g.aciklama}</div>}
          <table>
            <thead><tr><th>Parametre</th><th>Varsayılan</th><th>Yeni Değer (özel)</th></tr></thead>
            <tbody>
              {g.params.map((p) => (
                <tr key={p.ref} style={p.dinamik ? { background: '#f0fdf4' } : undefined}>
                  <td>
                    {p.label}{p.dinamik ? ' (yeni)' : ''}
                    <br /><span style={{ fontSize: 11, color: '#94a3b8' }}>{p.ref}</span>
                  </td>
                  <td>{String(p.varsayilan)}</td>
                  <td>
                    <input className="inp" style={{ maxWidth: 160 }}
                      defaultValue={p.override}
                      placeholder={String(p.varsayilan)}
                      onChange={e => setEdits(s => ({ ...s, [p.ref]: e.target.value }))} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {g.eklenebilir && g.rowSchema?.tip === 'yearly' && (
            <button type="button" className="btn-file" style={{ marginTop: 10 }} onClick={() => yilEkle(g)}>
              + Yıl ekle
            </button>
          )}
          {g.eklenebilir && g.rowSchema?.tip === 'custom' && (
            <button type="button" className="btn-file" style={{ marginTop: 10 }} onClick={() => satirEkle(g)}>
              + Satır ekle
            </button>
          )}
        </div>
      ))}

      <button className="hesapla-btn" onClick={kaydet}>KAYDET</button>
      {msg && <div className="note">{msg}</div>}
      <p className="sub" style={{ marginTop: 16 }}><a href="/">← Hesaplama sayfasına dön</a></p>
    </div>
  );
}

'use client';
import { useEffect, useState } from 'react';

export default function Admin() {
  const [cat, setCat] = useState<any>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const r = await fetch('/api/admin'); const d = await r.json();
    setCat(d); setEdits({}); setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function kaydet() {
    setMsg('Kaydediliyor…');
    const r = await fetch('/api/admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(edits) });
    const d = await r.json();
    setMsg(r.ok ? `Kaydedildi (${d.count} özel değer aktif).` : 'Hata: ' + d.error);
    load();
  }

  if (loading) return <div className="wrap"><p>Yükleniyor…</p></div>;

  return (
    <div className="wrap">
      <h1>Parametre Yönetimi (Admin)</h1>
      <div className="sub">Periyodik güncellenen değerleri buradan değiştirin. Boş bırakılan alan dosyadaki varsayılanı kullanır. Değişiklikler tüm hesaplamalara uygulanır.</div>

      {cat.gruplar.map((g: any, gi: number) => (
        <div className="card" key={gi}>
          <h2>{g.baslik}</h2>
          {g.aciklama && <div className="sub" style={{ marginTop: -4, marginBottom: 10 }}>{g.aciklama}</div>}
          <table>
            <thead><tr><th>Parametre</th><th>Varsayılan</th><th>Yeni Değer (özel)</th></tr></thead>
            <tbody>
              {g.params.map((p: any) => (
                <tr key={p.ref}>
                  <td>{p.label}<br /><span style={{ fontSize: 11, color: '#94a3b8' }}>{p.ref}</span></td>
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
        </div>
      ))}

      <button className="hesapla-btn" onClick={kaydet}>KAYDET</button>
      {msg && <div className="note">{msg}</div>}
      <p className="sub" style={{ marginTop: 16 }}><a href="/">← Hesaplama sayfasına dön</a></p>
    </div>
  );
}

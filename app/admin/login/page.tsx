'use client';
import { useState } from 'react';

export default function AdminLogin() {
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr('');
    const r = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user, pass }),
    });
    setLoading(false);
    if (r.ok) {
      const next = new URLSearchParams(window.location.search).get('next') || '/admin';
      window.location.href = next;
    } else {
      const d = await r.json().catch(() => ({}));
      setErr(d.error || 'Giriş başarısız.');
    }
  }

  return (
    <div className="wrap">
      <h1>Admin Girişi</h1>
      <div className="card">
        <form onSubmit={submit}>
          <div style={{ marginBottom: 10 }}>
            <input className="inp" placeholder="Kullanıcı adı" value={user}
              onChange={e => setUser(e.target.value)} autoFocus />
          </div>
          <div style={{ marginBottom: 10 }}>
            <input className="inp" type="password" placeholder="Şifre" value={pass}
              onChange={e => setPass(e.target.value)} />
          </div>
          <button className="hesapla-btn" disabled={loading || !user || !pass}>
            {loading ? 'Giriş yapılıyor…' : 'Giriş yap'}
          </button>
        </form>
        {err && <div className="note">{err}</div>}
      </div>
      <p className="sub" style={{ marginTop: 16 }}><a href="/">← Ana sayfaya dön</a></p>
    </div>
  );
}

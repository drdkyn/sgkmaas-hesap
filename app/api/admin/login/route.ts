import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const { user, pass } = await req.json();
  const expectedUser = process.env.ADMIN_USER;
  const expectedPass = process.env.ADMIN_PASS;

  if (!expectedUser || !expectedPass) {
    return NextResponse.json({ error: 'Admin erişimi yapılandırılmamış (ADMIN_USER / ADMIN_PASS eksik).' }, { status: 500 });
  }

  if (user !== expectedUser || pass !== expectedPass) {
    return NextResponse.json({ error: 'Kullanıcı adı veya şifre hatalı.' }, { status: 401 });
  }

  const token = Buffer.from(`${expectedUser}:${expectedPass}`).toString('base64');
  const res = NextResponse.json({ ok: true });
  res.cookies.set('admin_auth', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}

import { NextRequest, NextResponse } from 'next/server';

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*'],
};

const COOKIE_NAME = 'admin_auth';

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname === '/admin/login' || pathname === '/api/admin/login') {
    return NextResponse.next();
  }

  const user = process.env.ADMIN_USER;
  const pass = process.env.ADMIN_PASS;

  if (!user || !pass) {
    return new NextResponse('Admin erişimi yapılandırılmamış (ADMIN_USER / ADMIN_PASS eksik).', { status: 500 });
  }

  const expected = Buffer.from(`${user}:${pass}`).toString('base64');
  const cookie = req.cookies.get(COOKIE_NAME)?.value;

  if (cookie === expected) {
    return NextResponse.next();
  }

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Yetkilendirme gerekli.' }, { status: 401 });
  }

  const loginUrl = new URL('/admin/login', req.url);
  loginUrl.searchParams.set('next', pathname);
  return NextResponse.redirect(loginUrl);
}

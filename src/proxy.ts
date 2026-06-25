// =============================================================================
// src/middleware.ts
// Middleware Next.js — protege todas as rotas exceto /login e assets públicos.
// Refresca a sessão do Supabase em todas as requisições.
// =============================================================================
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// /api/cron é protegido por CRON_SECRET, não por sessão — precisa passar livre
// para o Vercel Cron conseguir chamar sem cookies de usuário.
const PUBLIC_PATHS = ['/login', '/auth', '/api/cron'];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublicPath = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  // Menor privilégio: só é admin quem tem role === 'admin' explícito.
  // Qualquer logado que NÃO seja admin é tratado como cliente (restrito).
  const isClient = !!user && user.app_metadata?.role !== 'admin';

  // Não logado → redireciona para /login (exceto se já está em rota pública)
  if (!user && !isPublicPath) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  // Já logado e tentando acessar /login → manda para a home do papel
  if (user && pathname === '/login') {
    const url = request.nextUrl.clone();
    url.pathname = isClient ? '/portal' : '/';
    url.searchParams.delete('next');
    return NextResponse.redirect(url);
  }

  // -------------------------------------------------------------------------
  // Restrições do CLIENTE (somente visualização):
  //  - APIs: só pode chamar /api/client/* (o resto → 403)
  //  - Páginas: só pode acessar /portal/* (o resto → redireciona p/ /portal)
  // -------------------------------------------------------------------------
  if (user && isClient) {
    if (pathname.startsWith('/api/')) {
      if (!pathname.startsWith('/api/client')) {
        return NextResponse.json({ error: 'Acesso restrito.' }, { status: 403 });
      }
    } else if (!pathname.startsWith('/portal')) {
      const url = request.nextUrl.clone();
      url.pathname = '/portal';
      url.search = '';
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Roda em todas as rotas EXCETO:
     * - _next/static (estáticos do build)
     * - _next/image  (otimização de imagens)
     * - favicon.ico, *.svg, *.png, *.jpg
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};

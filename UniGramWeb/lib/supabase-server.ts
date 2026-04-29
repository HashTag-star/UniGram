import { createServerClient } from '@supabase/ssr';
import { createBrowserClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

const url  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/** Server-component / Route-handler client (reads cookies). */
export function createSupabaseServerClient() {
  const cookieStore = cookies();
  return createServerClient(url, anon, {
    cookies: {
      getAll()         { return cookieStore.getAll(); },
      setAll(toSet)    { try { toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } catch {} },
    },
  });
}

/** Middleware client (reads + writes response cookies). */
export function createSupabaseMiddlewareClient(req: NextRequest, res: NextResponse) {
  return createServerClient(url, anon, {
    cookies: {
      getAll()         { return req.cookies.getAll(); },
      setAll(toSet)    { toSet.forEach(({ name, value, options }) => { req.cookies.set(name, value); res.cookies.set(name, value, options); }); },
    },
  });
}

/** Browser/client component client (uses localStorage — kept for existing pages). */
export { createBrowserClient };

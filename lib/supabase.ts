// lib/supabase.ts
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/** Use this in Server Components/pages: read-only cookies (no set/remove) */
export async function supabaseServerComponent() {
  const store = await cookies(); // Next 15 dynamic API must be awaited
  return createServerClient(url, anon, {
    cookies: {
      get: async (name: string) => store.get(name)?.value,
      // no set/remove here — pages can’t modify cookies
    },
  });
}

/** Use this ONLY in Route Handlers / Server Actions: can set/remove cookies */
export async function supabaseRoute() {
  const store = await cookies();
  return createServerClient(url, anon, {
    cookies: {
      get: async (name: string) => store.get(name)?.value,
      set: async (name: string, value: string, options: CookieOptions) => {
        store.set(name, value, options);
      },
      remove: async (name: string) => {
        store.delete(name);
      },
    },
  });
}

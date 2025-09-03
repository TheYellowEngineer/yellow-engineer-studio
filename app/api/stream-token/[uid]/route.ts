// app/api/stream-token/[uid]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseRoute } from '@/lib/supabase';

type CFTokenResult = {
  result?: { token?: string };
  success?: boolean;
  errors?: unknown[];
  messages?: unknown[];
};

const TOKEN_TTL_SECONDS = 9 * 60; // 9 minutes (token is 10 mins)
type CacheKey = `${string}:${string}`; // uid:userId
const tokenCache = new Map<CacheKey, { token: string; exp: number }>();

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ uid: string }> }
) {
  try {
    const { uid } = await context.params;
    const supabase = await supabaseRoute();

    // 1) Auth
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();
    if (authErr) {
      return NextResponse.json({ error: 'auth_error', detail: authErr.message }, { status: 401 });
    }
    if (!user) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    // 2) DB checks
    const { data: tut, error: tutErr } = await supabase
      .from('tutorials')
      .select('id')
      .eq('cf_stream_uid', uid)
      .maybeSingle();

    if (tutErr) {
      return NextResponse.json({ error: 'db_error', detail: tutErr.message }, { status: 500 });
    }
    if (!tut) {
      return NextResponse.json({ error: 'not_found', detail: 'tutorial not found' }, { status: 404 });
    }

    const { data: purchase, error: pErr } = await supabase
      .from('purchases')
      .select('id')
      .eq('tutorial_id', tut.id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (pErr) {
      return NextResponse.json({ error: 'db_error', detail: pErr.message }, { status: 500 });
    }
    if (!purchase) {
      return NextResponse.json({ error: 'forbidden', detail: 'no purchase' }, { status: 403 });
    }

    // 3) Cache hit?
    const cacheKey: CacheKey = `${uid}:${user.id}`;
    const now = Math.floor(Date.now() / 1000);
    const cached = tokenCache.get(cacheKey);
    if (cached && cached.exp > now + 15) {
      // still has ~15s safety margin
      return NextResponse.json({ token: cached.token }, { status: 200 });
    }

    // 4) Cloudflare token request
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const apiToken = process.env.CLOUDFLARE_API_TOKEN;
    if (!accountId || !apiToken) {
      return NextResponse.json({ error: 'config', detail: 'cloudflare env missing' }, { status: 500 });
    }

    const issueToken = async () => {
      const exp = now + TOKEN_TTL_SECONDS;
      const r = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${uid}/token`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiToken}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'User-Agent': 'yellow-engineer-studio/1.0 (+vercel-server)',
          },
          body: JSON.stringify({ exp }),
          cache: 'no-store',
        }
      );

      const rayId = r.headers.get('cf-ray') ?? r.headers.get('cf-ray-id') ?? null;
      const ct = r.headers.get('content-type') ?? '';

      if (!ct.includes('application/json')) {
        const text = await r.text();
        return {
          ok: false as const,
          status: r.status,
          nonjson: true,
          rayId,
          detail: text.slice(0, 1000),
        };
      }

      const payloadUnknown: unknown = await r.json().catch(() => null);
      const payload = (payloadUnknown ?? {}) as CFTokenResult;

      const token = payload?.result?.token;
      return {
        ok: r.ok && !!token,
        status: r.status,
        rayId,
        token: token ?? null,
        payload,
      };
    };

    // first attempt
    let res = await issueToken();

    // retry once on likely bot/edge blocks (403/429 non-JSON HTML)
    if (!res.ok && res.nonjson && (res.status === 403 || res.status === 429)) {
      await new Promise((s) => setTimeout(s, 300)); // tiny backoff
      res = await issueToken();
    }

    if (!res.ok) {
      // Uniform error envelope with diagnostics
      return NextResponse.json(
        {
          error: 'cloudflare_error',
          status: res.status,
          rayId: (res as any).rayId ?? null,
          detail: (res as any).payload ?? (res as any).detail ?? 'non-json error',
        },
        { status: 502 }
      );
    }

    const token = (res as { token: string }).token;
    // Save to cache
    tokenCache.set(cacheKey, { token, exp: now + TOKEN_TTL_SECONDS });

    return NextResponse.json({ token }, { status: 200 });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: 'unexpected', detail: message }, { status: 500 });
  }
}

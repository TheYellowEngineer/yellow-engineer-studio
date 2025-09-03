// app/api/stream-token/[uid]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseRoute } from '@/lib/supabase';

type CFTokenResult = {
  result?: { token?: string };
  success?: boolean;
  errors?: unknown[];
  messages?: unknown[];
};

const TOKEN_TTL_SECONDS = 9 * 60; // 9 minutes (token lives ~10m)
type CacheKey = `${string}:${string}`; // `${uid}:${userId}`
const tokenCache = new Map<CacheKey, { token: string; exp: number }>();

// Shapes for the Cloudflare request helper (no `any`)
type IssueResultNonJson = {
  ok: false;
  status: number;
  nonjson: true;
  rayId: string | null;
  detail: string; // HTML/text snippet
};
type IssueResultJson = {
  ok: boolean; // true only if r.ok && token
  status: number;
  rayId: string | null;
  token: string | null;
  payload: CFTokenResult;
};
type IssueResult = IssueResultNonJson | IssueResultJson;

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
      return NextResponse.json(
        { error: 'auth_error', detail: authErr.message },
        { status: 401 }
      );
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
      return NextResponse.json(
        { error: 'db_error', detail: tutErr.message },
        { status: 500 }
      );
    }
    if (!tut) {
      return NextResponse.json(
        { error: 'not_found', detail: 'tutorial not found' },
        { status: 404 }
      );
    }

    const { data: purchase, error: pErr } = await supabase
      .from('purchases')
      .select('id')
      .eq('tutorial_id', tut.id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (pErr) {
      return NextResponse.json(
        { error: 'db_error', detail: pErr.message },
        { status: 500 }
      );
    }
    if (!purchase) {
      return NextResponse.json(
        { error: 'forbidden', detail: 'no purchase' },
        { status: 403 }
      );
    }

    // 3) Cache
    const cacheKey: CacheKey = `${uid}:${user.id}`;
    const now = Math.floor(Date.now() / 1000);
    const cached = tokenCache.get(cacheKey);
    if (cached && cached.exp > now + 15) {
      return NextResponse.json({ token: cached.token }, { status: 200 });
    }

    // 4) Cloudflare token request (typed, with headers)
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const apiToken = process.env.CLOUDFLARE_API_TOKEN;
    if (!accountId || !apiToken) {
      return NextResponse.json(
        { error: 'config', detail: 'cloudflare env missing' },
        { status: 500 }
      );
    }

    const issueToken = async (): Promise<IssueResult> => {
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
          ok: false,
          status: r.status,
          nonjson: true,
          rayId,
          detail: text.slice(0, 1000),
        };
        }
      const payloadUnknown: unknown = await r.json().catch(() => null);
      const payload = (payloadUnknown ?? {}) as CFTokenResult;
      const token = payload?.result?.token ?? null;
      return {
        ok: r.ok && !!token,
        status: r.status,
        rayId,
        token,
        payload,
      };
    };

    // Attempt + light retry for edge blocks
    let res = await issueToken();
    if (
      res.ok === false &&
      'nonjson' in res &&
      res.nonjson === true &&
      (res.status === 403 || res.status === 429)
    ) {
      await new Promise((s) => setTimeout(s, 300));
      res = await issueToken();
    }

    if (!res.ok) {
      // Build a typed diagnostic payload
      const detail =
        'nonjson' in res && res.nonjson ? res.detail : (res as IssueResultJson).payload;
      return NextResponse.json(
        {
          error: 'cloudflare_error',
          status: res.status,
          rayId: res.rayId,
          detail,
        },
        { status: 502 }
      );
    }

    // Success → cache and return
    const token = (res as IssueResultJson).token as string; // token exists when ok=true
    tokenCache.set(cacheKey, { token, exp: now + TOKEN_TTL_SECONDS });
    return NextResponse.json({ token }, { status: 200 });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: 'unexpected', detail: message },
      { status: 500 }
    );
  }
}

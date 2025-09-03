// app/api/stream-token/[uid]/route.ts
import { NextResponse } from 'next/server';
import { supabaseRoute } from '@/lib/supabase';

export async function GET(
  _req: Request,
  { params }: { params: { uid: string } }
) {
  try {
    const { uid } = params;
    const supabase = await supabaseRoute();

    // 1) Auth
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr) {
      return NextResponse.json({ error: 'auth_error', detail: authErr.message }, { status: 401 });
    }
    if (!user) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    // 2) Find tutorial by Cloudflare Stream UID
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

    // 3) Verify purchase
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

    // 4) Cloudflare token request (must send JSON)
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const apiToken  = process.env.CLOUDFLARE_API_TOKEN;
    if (!accountId || !apiToken) {
      return NextResponse.json({ error: 'config', detail: 'cloudflare env missing' }, { status: 500 });
    }

    const r = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${uid}/token`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 60 * 10 }), // 10 minutes
        cache: 'no-store',
      }
    );

    const ct = r.headers.get('content-type') || '';
    if (!ct.includes('application/json')) {
      const text = await r.text();
      return NextResponse.json({ error: 'cloudflare_nonjson', detail: text }, { status: 502 });
    }

    const payload: any = await r.json().catch(() => null);
    if (!r.ok || !payload?.result?.token) {
      return NextResponse.json({ error: 'cloudflare_error', detail: payload }, { status: 502 });
    }

    // 5) Always return a predictable envelope
    return NextResponse.json({ token: payload.result.token }, { status: 200 });

  } catch (e: any) {
    // Last-resort JSON error
    return NextResponse.json({ error: 'unexpected', detail: e?.message ?? String(e) }, { status: 500 });
  }
}

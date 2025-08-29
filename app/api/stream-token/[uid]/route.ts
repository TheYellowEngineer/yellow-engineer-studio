// app/api/stream-token/[uid]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseRoute } from '@/lib/supabase';

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ uid: string }> } // <- Promise here
) {
  const { uid } = await context.params;          // <- await it
  const supabase = await supabaseRoute();        // route handler (can set cookies)

  // Must be signed in
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  // Find tutorial by Cloudflare Stream UID
  const { data: tut, error: tutErr } = await supabase
    .from('tutorials')
    .select('id')
    .eq('cf_stream_uid', uid)
    .single();

  if (tutErr || !tut) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Verify purchase
  const { data: purchase } = await supabase
    .from('purchases')
    .select('id')
    .eq('tutorial_id', tut.id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!purchase) return NextResponse.json({ error: 'No access' }, { status: 403 });

  // Request signed playback token from Cloudflare Stream
  const resp = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/stream/${uid}/token`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}` },
    }
  );

  const json = await resp.json();
  if (!resp.ok) return NextResponse.json(json, { status: 500 });

  return NextResponse.json(json.result);
}

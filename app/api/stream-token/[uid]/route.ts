// app/api/stream-token/[uid]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';


export async function GET(
req: NextRequest,
{ params }: { params: { uid: string } }
) {
const supabase = await supabaseServer();
const {
data: { user },
} = await supabase.auth.getUser();
if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });


const uid = params.uid;
const tutorialRes = await supabase
.from('tutorials')
.select('id')
.eq('cf_stream_uid', uid)
.single();


if (!tutorialRes.data) return NextResponse.json({ error: 'Not found' }, { status: 404 });


// verify purchase
const hasPurchase = await supabase
.from('purchases')
.select('id')
.eq('tutorial_id', tutorialRes.data.id)
.eq('user_id', user.id)
.maybeSingle();


if (!hasPurchase.data) return NextResponse.json({ error: 'No access' }, { status: 403 });


// call Cloudflare Stream Token API
const tokenResp = await fetch(
`https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/stream/${uid}/token`,
{
method: 'POST',
headers: {
Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
},
}
);
const json = await tokenResp.json();
if (!tokenResp.ok) return NextResponse.json(json, { status: 500 });
return NextResponse.json(json.result);
}

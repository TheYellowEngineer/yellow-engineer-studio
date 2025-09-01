// app/api/checkout/route.ts
import Stripe from "stripe";
import { NextRequest, NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: NextRequest) {
  // accept either JSON or form posts
  const ct = req.headers.get("content-type") || "";
  let tutorialId = "";

  if (ct.includes("application/json")) {
    const body = await req.json().catch(() => ({}));
    tutorialId = body?.tutorialId || "";
  } else {
    const fd = await req.formData();
    tutorialId = String(fd.get("tutorialId") ?? "");
  }
  if (!tutorialId) {
    return NextResponse.json({ error: "Missing tutorialId" }, { status: 400 });
  }

  // auth
  const supabase = await supabaseRoute();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    // Graceful redirect to login with return=referer (the page that had the Buy button)
    const referer = req.headers.get('referer') || process.env.NEXT_PUBLIC_SITE_URL || '/';
    const loginUrl = new URL('/login', process.env.NEXT_PUBLIC_SITE_URL);
    // If referer is same-origin, use its path; else default to home
    try {
      const r = new URL(referer);
      const sameOrigin = r.origin === process.env.NEXT_PUBLIC_SITE_URL;
      const nextPath = sameOrigin ? (r.pathname + r.search) : '/';
      loginUrl.searchParams.set('next', nextPath);
    } catch {
      // ignore URL parse errors
      loginUrl.searchParams.set('next', '/');
    }
    return NextResponse.redirect(loginUrl, { status: 303 });
  }

  // fetch tutorial
  const { data: t } = await supabase
    .from("tutorials")
    .select("id, slug, title, stripe_price_id")
    .eq("id", tutorialId)
    .single();

  if (!t) return NextResponse.json({ error: "Tutorial not found" }, { status: 404 });
  if (!t.stripe_price_id) {
    return NextResponse.json({ error: "Tutorial not purchasable" }, { status: 400 });
  }

  // create checkout session
  const base = process.env.NEXT_PUBLIC_SITE_URL!;
  const success_url = `${base}/tutorials/${t.slug}?success=1`;
  const cancel_url = `${base}/tutorials/${t.slug}?canceled=1`;

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [{ price: t.stripe_price_id, quantity: 1 }],
    metadata: { tutorial_id: t.id },
    client_reference_id: user.id,
    customer_email: user.email ?? undefined,
    success_url,
    cancel_url,
  });

  // redirect browser to Stripe
  return NextResponse.redirect(session.url!, { status: 303 });
}
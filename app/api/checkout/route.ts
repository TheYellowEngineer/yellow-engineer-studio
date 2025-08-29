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
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

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
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [{ price: t.stripe_price_id, quantity: 1 }],
    metadata: { tutorial_id: t.id },
    client_reference_id: user.id,
    customer_email: user.email ?? undefined,
    success_url: `${process.env.NEXT_PUBLIC_SITE_URL}/tutorials/${t.slug}?success=1`,
    cancel_url:  `${process.env.NEXT_PUBLIC_SITE_URL}/tutorials/${t.slug}?canceled=1`,
  });

  // redirect browser to Stripe
  return NextResponse.redirect(session.url!, { status: 303 });
}

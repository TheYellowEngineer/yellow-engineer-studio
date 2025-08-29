// app/api/stripe-webhook/route.ts
import Stripe from "stripe";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: NextRequest) {
  const sig = req.headers.get("stripe-signature");
  const rawBody = Buffer.from(await req.arrayBuffer());

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig as string,
      process.env.STRIPE_WEBHOOK_SECRET as string
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown signature error";
    console.error("WEBHOOK VERIFY ERROR:", msg);
    return NextResponse.json({ error: "Bad signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;

    const tutorialId = session.metadata?.tutorial_id ?? null;
    const userId = session.client_reference_id ?? null;

    console.log("WEBHOOK session:", {
      id: session.id,
      tutorialId,
      userId,
      amount_total: session.amount_total,
      currency: session.currency,
      mode: session.mode,
      payment_status: session.payment_status,
    });

    if (!tutorialId || !userId) {
      console.error("Missing tutorialId or userId in session metadata/client_reference_id");
      return NextResponse.json({ ok: true });
    }

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { error: insertErr } = await admin.from("purchases").insert({
      user_id: userId,
      tutorial_id: tutorialId,
      stripe_checkout_session_id: session.id,
      amount_cents: session.amount_total ?? 0,
      currency: session.currency ?? "usd",
    });

    if (insertErr) {
      console.error("SUPABASE INSERT ERROR:", insertErr);
    } else {
      console.log("Purchase inserted for user", userId, "tutorial", tutorialId);
    }
  } else {
    console.log("Unhandled Stripe event:", event.type);
  }

  return NextResponse.json({ received: true });
}

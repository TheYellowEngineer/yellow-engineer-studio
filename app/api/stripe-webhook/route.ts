// app/api/stripe-webhook/route.ts
import Stripe from "stripe";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2024-06-20" });

export async function POST(req: NextRequest) {
  try {
    const sig = req.headers.get("stripe-signature");
    const buf = Buffer.from(await req.arrayBuffer());

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(buf, sig!, process.env.STRIPE_WEBHOOK_SECRET!);
    } catch (err: any) {
      console.error("WEBHOOK VERIFY ERROR:", err.message);
      return NextResponse.json({ error: "Bad signature" }, { status: 400 });
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;

      // We set these in /api/checkout
      const tutorialId = session.metadata?.tutorial_id;
      const userId = session.client_reference_id; // <-- Supabase auth user id

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
        return NextResponse.json({ ok: true }); // acknowledge to avoid retries
      }

      const admin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY! // server key
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
      // Optional: log other events during dev
      console.log("Unhandled Stripe event:", event.type);
    }

    return NextResponse.json({ received: true });
  } catch (e: any) {
    console.error("WEBHOOK FATAL:", e?.message || e);
    return NextResponse.json({ error: "Webhook failed" }, { status: 500 });
  }
}

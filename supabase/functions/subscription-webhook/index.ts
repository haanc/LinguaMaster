// LemonSqueezy Subscription Webhook Handler
// Securely processes subscription events (create, update, cancel, expire)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createServiceClient, corsHeaders } from "../_shared/utils.ts";
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts";
import { encodeHex } from "https://deno.land/std@0.168.0/encoding/hex.ts";

const WEBHOOK_SECRET = Deno.env.get("LEMONSQUEEZY_WEBHOOK_SECRET") || "";

// HMAC-SHA256 using Web Crypto API
async function hmacSha256(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(message);

  const key = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", key, messageData);
  return encodeHex(new Uint8Array(signature));
}

serve(async (req) => {
  // Only POST allowed
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const payload = await req.text();
    const signature = req.headers.get("X-Signature") || "";

    // Verify webhook signature
    if (WEBHOOK_SECRET) {
      const expectedSignature = await hmacSha256(WEBHOOK_SECRET, payload);
      if (signature !== expectedSignature) {
        console.error("Invalid webhook signature");
        return new Response("Invalid signature", { status: 401 });
      }
    }

    const data = JSON.parse(payload);
    const eventName = data.meta?.event_name;
    const eventData = data.data || {};
    const attributes = eventData.attributes || {};
    const customData = data.meta?.custom_data || {};

    // Get user ID from custom data
    const userId = customData.user_id;
    if (!userId) {
      console.error("No user_id in webhook custom_data");
      return new Response(JSON.stringify({ error: "Missing user_id" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const supabase = createServiceClient();

    console.log(`Processing webhook: ${eventName} for user ${userId}`);

    switch (eventName) {
      case "subscription_created":
      case "subscription_updated":
      case "subscription_resumed":
        await handleSubscriptionActive(supabase, userId, eventData, attributes);
        break;

      case "subscription_cancelled":
        await handleSubscriptionCancelled(supabase, userId, eventData, attributes);
        break;

      case "subscription_expired":
        await handleSubscriptionExpired(supabase, userId, eventData, attributes);
        break;

      case "subscription_payment_failed":
        await handlePaymentFailed(supabase, userId, eventData, attributes);
        break;

      case "subscription_payment_success":
        await handlePaymentSuccess(supabase, userId, eventData, attributes);
        break;

      case "order_created":
        // Check if this is a credit top-up
        if (customData.type === "credit_topup") {
          await handleCreditPurchase(supabase, userId, eventData, attributes, customData);
        }
        break;

      default:
        console.log(`Unhandled event: ${eventName}`);
    }

    return new Response(JSON.stringify({ status: "ok" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Webhook processing error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});

async function handleSubscriptionActive(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  eventData: Record<string, unknown>,
  attributes: Record<string, unknown>
) {
  const lemonSubId = String(eventData.id);
  const lemonCustomerId = String(attributes.customer_id);
  const variantId = String(attributes.variant_id);

  // Determine plan from variant (configure in env)
  const monthlyVariantId = Deno.env.get("LEMONSQUEEZY_MONTHLY_VARIANT_ID");
  const plan = variantId === monthlyVariantId ? "monthly" : "yearly";

  const status = mapLemonStatus(String(attributes.status));

  // Upsert subscription
  await supabase.from("subscriptions").upsert(
    {
      user_id: userId,
      lemon_subscription_id: lemonSubId,
      lemon_customer_id: lemonCustomerId,
      lemon_order_id: String(attributes.order_id),
      lemon_product_id: String(attributes.product_id),
      lemon_variant_id: variantId,
      plan,
      status,
      current_period_start: attributes.current_period_start,
      current_period_end: attributes.renews_at || attributes.ends_at,
      cancel_at_period_end: false,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "lemon_subscription_id" }
  );

  // Upgrade user to Pro
  await supabase.rpc("upgrade_to_pro", { p_user_id: userId });

  console.log(`User ${userId} upgraded to Pro`);
}

async function handleSubscriptionCancelled(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  eventData: Record<string, unknown>,
  _attributes: Record<string, unknown>
) {
  const lemonSubId = String(eventData.id);

  await supabase
    .from("subscriptions")
    .update({
      cancel_at_period_end: true,
      cancelled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("lemon_subscription_id", lemonSubId);

  console.log(`Subscription ${lemonSubId} marked for cancellation`);
}

async function handleSubscriptionExpired(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  eventData: Record<string, unknown>,
  _attributes: Record<string, unknown>
) {
  const lemonSubId = String(eventData.id);

  await supabase
    .from("subscriptions")
    .update({
      status: "expired",
      ends_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("lemon_subscription_id", lemonSubId);

  // Downgrade user to Free
  await supabase.rpc("downgrade_to_free", { p_user_id: userId });

  console.log(`User ${userId} downgraded to Free`);
}

async function handlePaymentFailed(
  supabase: ReturnType<typeof createServiceClient>,
  _userId: string,
  eventData: Record<string, unknown>,
  _attributes: Record<string, unknown>
) {
  const lemonSubId = String(eventData.id);

  await supabase
    .from("subscriptions")
    .update({
      status: "past_due",
      updated_at: new Date().toISOString(),
    })
    .eq("lemon_subscription_id", lemonSubId);
}

async function handlePaymentSuccess(
  supabase: ReturnType<typeof createServiceClient>,
  _userId: string,
  eventData: Record<string, unknown>,
  attributes: Record<string, unknown>
) {
  const lemonSubId = String(eventData.id);

  await supabase
    .from("subscriptions")
    .update({
      status: "active",
      current_period_end: attributes.renews_at,
      updated_at: new Date().toISOString(),
    })
    .eq("lemon_subscription_id", lemonSubId);
}

async function handleCreditPurchase(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  eventData: Record<string, unknown>,
  attributes: Record<string, unknown>,
  customData: Record<string, unknown>
) {
  const orderId = String(eventData.id);
  const creditsAmount = Number(customData.credits_amount) || 5000;
  const amountUsd = Number(attributes.total) / 100; // Convert from cents

  // Record purchase
  await supabase.from("credit_purchases").insert({
    user_id: userId,
    lemon_order_id: orderId,
    amount_usd: amountUsd,
    credits_amount: creditsAmount,
    status: "completed",
  });

  // Add credits
  await supabase.rpc("add_credits", {
    p_user_id: userId,
    p_amount: creditsAmount,
    p_action: "purchase",
    p_metadata: { order_id: orderId, amount_usd: amountUsd },
  });

  console.log(`Added ${creditsAmount} credits to user ${userId}`);
}

function mapLemonStatus(lemonStatus: string): string {
  const mapping: Record<string, string> = {
    active: "active",
    cancelled: "cancelled",
    expired: "expired",
    past_due: "past_due",
    paused: "paused",
    unpaid: "unpaid",
    on_trial: "active",
  };
  return mapping[lemonStatus] || "active";
}

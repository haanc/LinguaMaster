"""LemonSqueezy webhook handler for subscription events."""

import os
import hmac
import hashlib
from fastapi import APIRouter, Request, HTTPException, Header
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

router = APIRouter(prefix="/webhooks", tags=["webhooks"])

# LemonSqueezy webhook secret
LEMON_WEBHOOK_SECRET = os.getenv("LEMONSQUEEZY_WEBHOOK_SECRET", "")


def verify_signature(payload: bytes, signature: str, secret: str) -> bool:
    """Verify LemonSqueezy webhook signature."""
    if not secret:
        return True  # Skip verification in dev mode

    expected = hmac.new(
        secret.encode(),
        payload,
        hashlib.sha256
    ).hexdigest()

    return hmac.compare_digest(expected, signature)


@router.post("/lemonsqueezy")
async def handle_lemonsqueezy_webhook(
    request: Request,
    x_signature: Optional[str] = Header(None, alias="X-Signature"),
):
    """
    Handle LemonSqueezy webhook events.

    Events handled:
    - subscription_created: New subscription
    - subscription_updated: Status change
    - subscription_cancelled: Cancelled (but still active until period end)
    - subscription_resumed: Resumed from cancelled
    - subscription_expired: Subscription ended
    - subscription_payment_failed: Payment failed
    - subscription_payment_success: Payment succeeded
    - order_created: One-time purchase (credit top-up)
    """
    from auth.supabase_client import get_supabase_client

    payload = await request.body()

    # Verify signature
    if LEMON_WEBHOOK_SECRET and x_signature:
        if not verify_signature(payload, x_signature, LEMON_WEBHOOK_SECRET):
            raise HTTPException(status_code=401, detail="Invalid signature")

    data = await request.json()

    event_name = data.get("meta", {}).get("event_name")
    event_data = data.get("data", {})
    attributes = event_data.get("attributes", {})

    # Get user email from custom data or customer email
    custom_data = data.get("meta", {}).get("custom_data", {})
    user_id = custom_data.get("user_id")

    supabase = get_supabase_client()
    if not supabase:
        # Log but don't fail - we'll process later
        print(f"[Webhook] Supabase not configured, event: {event_name}")
        return {"status": "accepted", "message": "Supabase not configured"}

    if event_name in [
        "subscription_created",
        "subscription_updated",
        "subscription_resumed",
    ]:
        await handle_subscription_active(supabase, user_id, event_data, attributes)

    elif event_name == "subscription_cancelled":
        await handle_subscription_cancelled(supabase, user_id, event_data, attributes)

    elif event_name == "subscription_expired":
        await handle_subscription_expired(supabase, user_id, event_data, attributes)

    elif event_name == "subscription_payment_failed":
        await handle_payment_failed(supabase, user_id, event_data, attributes)

    elif event_name == "subscription_payment_success":
        await handle_payment_success(supabase, user_id, event_data, attributes)

    elif event_name == "order_created":
        # Check if this is a credit top-up order
        if custom_data.get("type") == "credit_topup":
            await handle_credit_purchase(supabase, user_id, event_data, attributes, custom_data)

    return {"status": "ok"}


async def handle_subscription_active(supabase, user_id: str, event_data: dict, attributes: dict):
    """Handle active subscription (created, updated, resumed)."""
    lemon_sub_id = str(event_data.get("id"))
    lemon_customer_id = str(attributes.get("customer_id"))

    # Determine plan from variant
    variant_id = str(attributes.get("variant_id"))
    # You would map variant IDs to plans in your config
    plan = "monthly"  # Default, update based on variant_id

    status = attributes.get("status", "active")

    # Parse dates
    current_period_start = attributes.get("current_period_start")
    current_period_end = attributes.get("renews_at") or attributes.get("ends_at")

    # Upsert subscription
    supabase.table("subscriptions").upsert({
        "user_id": user_id,
        "lemon_subscription_id": lemon_sub_id,
        "lemon_customer_id": lemon_customer_id,
        "lemon_order_id": str(attributes.get("order_id")),
        "lemon_product_id": str(attributes.get("product_id")),
        "lemon_variant_id": variant_id,
        "plan": plan,
        "status": map_lemon_status(status),
        "current_period_start": current_period_start,
        "current_period_end": current_period_end,
        "cancel_at_period_end": False,
        "updated_at": datetime.now().isoformat(),
    }, on_conflict="lemon_subscription_id").execute()

    # Upgrade user to Pro
    supabase.rpc("upgrade_to_pro", {"p_user_id": user_id}).execute()


async def handle_subscription_cancelled(supabase, user_id: str, event_data: dict, attributes: dict):
    """Handle subscription cancellation (still active until period end)."""
    lemon_sub_id = str(event_data.get("id"))

    supabase.table("subscriptions").update({
        "cancel_at_period_end": True,
        "cancelled_at": datetime.now().isoformat(),
        "updated_at": datetime.now().isoformat(),
    }).eq("lemon_subscription_id", lemon_sub_id).execute()


async def handle_subscription_expired(supabase, user_id: str, event_data: dict, attributes: dict):
    """Handle subscription expiration."""
    lemon_sub_id = str(event_data.get("id"))

    supabase.table("subscriptions").update({
        "status": "expired",
        "ends_at": datetime.now().isoformat(),
        "updated_at": datetime.now().isoformat(),
    }).eq("lemon_subscription_id", lemon_sub_id).execute()

    # Downgrade user to Free
    supabase.rpc("downgrade_to_free", {"p_user_id": user_id}).execute()


async def handle_payment_failed(supabase, user_id: str, event_data: dict, attributes: dict):
    """Handle failed payment."""
    lemon_sub_id = str(event_data.get("id"))

    supabase.table("subscriptions").update({
        "status": "past_due",
        "updated_at": datetime.now().isoformat(),
    }).eq("lemon_subscription_id", lemon_sub_id).execute()


async def handle_payment_success(supabase, user_id: str, event_data: dict, attributes: dict):
    """Handle successful payment."""
    lemon_sub_id = str(event_data.get("id"))

    # Update subscription dates
    current_period_end = attributes.get("renews_at")

    supabase.table("subscriptions").update({
        "status": "active",
        "current_period_end": current_period_end,
        "updated_at": datetime.now().isoformat(),
    }).eq("lemon_subscription_id", lemon_sub_id).execute()


async def handle_credit_purchase(
    supabase,
    user_id: str,
    event_data: dict,
    attributes: dict,
    custom_data: dict
):
    """Handle one-time credit top-up purchase."""
    order_id = str(event_data.get("id"))
    credits_amount = custom_data.get("credits_amount", 5000)
    amount_usd = float(attributes.get("total", 0)) / 100  # Convert from cents

    # Record purchase
    supabase.table("credit_purchases").insert({
        "user_id": user_id,
        "lemon_order_id": order_id,
        "amount_usd": amount_usd,
        "credits_amount": credits_amount,
        "status": "completed",
    }).execute()

    # Add credits
    supabase.rpc("add_credits", {
        "p_user_id": user_id,
        "p_amount": credits_amount,
        "p_action": "purchase",
        "p_metadata": {"order_id": order_id, "amount_usd": amount_usd}
    }).execute()


def map_lemon_status(lemon_status: str) -> str:
    """Map LemonSqueezy status to our status."""
    mapping = {
        "active": "active",
        "cancelled": "cancelled",
        "expired": "expired",
        "past_due": "past_due",
        "paused": "paused",
        "unpaid": "unpaid",
        "on_trial": "active",
    }
    return mapping.get(lemon_status, "active")

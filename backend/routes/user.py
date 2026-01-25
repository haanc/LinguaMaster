"""User account routes for profile, credits, and devices."""

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from typing import Optional, List
from auth.dependencies import get_current_user, require_auth
from auth.models import User, UserTier
from auth.credits import credit_service, CREDIT_COSTS
from auth.devices import device_service, DeviceLimitError

router = APIRouter(prefix="/user", tags=["user"])


# ============================================================================
# Request/Response Models
# ============================================================================

class UserProfileResponse(BaseModel):
    id: str
    email: Optional[str]
    tier: str
    credits_balance: int
    credits_monthly_limit: int
    credits_reset_at: Optional[str]
    referral_code: Optional[str]


class CreditUsageResponse(BaseModel):
    total_used: int
    by_action: dict
    balance: int
    limit: int
    reset_at: Optional[str]


class CreditHistoryItem(BaseModel):
    id: str
    amount: int
    balance_after: int
    action: str
    metadata: dict
    created_at: str


class DeviceResponse(BaseModel):
    id: str
    device_name: str
    platform: Optional[str]
    app_version: Optional[str]
    is_active: bool
    last_active_at: str
    created_at: str


class RegisterDeviceRequest(BaseModel):
    device_name: str
    device_fingerprint: str
    platform: Optional[str] = None
    app_version: Optional[str] = None


class ApplyReferralRequest(BaseModel):
    referral_code: str


# ============================================================================
# Profile Endpoints
# ============================================================================

@router.get("/profile", response_model=UserProfileResponse)
async def get_profile(user: User = Depends(get_current_user)):
    """Get current user's profile."""
    if user.is_guest:
        raise HTTPException(status_code=401, detail="Authentication required")

    return UserProfileResponse(
        id=user.id,
        email=user.email,
        tier=user.tier.value,
        credits_balance=user.credits_balance,
        credits_monthly_limit=user.credits_monthly_limit,
        credits_reset_at=user.credits_reset_at.isoformat() if user.credits_reset_at else None,
        referral_code=user.referral_code,
    )


@router.get("/credit-costs")
async def get_credit_costs():
    """Get credit costs for all actions."""
    return CREDIT_COSTS


# ============================================================================
# Credit Endpoints
# ============================================================================

@router.get("/credits/usage", response_model=CreditUsageResponse)
@require_auth
async def get_credit_usage(user: User = Depends(get_current_user)):
    """Get credit usage summary for current billing period."""
    summary = await credit_service.get_usage_summary(user.id)
    return CreditUsageResponse(
        total_used=summary.get("total_used", 0),
        by_action=summary.get("by_action", {}),
        balance=summary.get("balance", 0),
        limit=summary.get("limit", 500),
        reset_at=summary.get("reset_at"),
    )


@router.get("/credits/history", response_model=List[CreditHistoryItem])
@require_auth
async def get_credit_history(
    limit: int = 50,
    offset: int = 0,
    user: User = Depends(get_current_user)
):
    """Get credit transaction history."""
    logs = await credit_service.get_usage_history(user.id, limit, offset)
    return [
        CreditHistoryItem(
            id=log.id,
            amount=log.amount,
            balance_after=log.balance_after,
            action=log.action,
            metadata=log.metadata,
            created_at=log.created_at.isoformat() if log.created_at else "",
        )
        for log in logs
    ]


# ============================================================================
# Device Endpoints
# ============================================================================

@router.get("/devices", response_model=List[DeviceResponse])
@require_auth
async def get_devices(user: User = Depends(get_current_user)):
    """Get all registered devices."""
    devices = await device_service.get_devices(user.id)
    return [
        DeviceResponse(
            id=d.id,
            device_name=d.device_name,
            platform=d.platform,
            app_version=d.app_version,
            is_active=d.is_active,
            last_active_at=d.last_active_at.isoformat() if d.last_active_at else "",
            created_at=d.created_at.isoformat() if d.created_at else "",
        )
        for d in devices
    ]


@router.post("/devices/register", response_model=DeviceResponse)
@require_auth
async def register_device(
    request: RegisterDeviceRequest,
    user: User = Depends(get_current_user)
):
    """Register a new device."""
    try:
        device = await device_service.register_device(
            user_id=user.id,
            device_name=request.device_name,
            device_fingerprint=request.device_fingerprint,
            platform=request.platform,
            app_version=request.app_version,
            tier=user.tier,
        )
        return DeviceResponse(
            id=device.id,
            device_name=device.device_name,
            platform=device.platform,
            app_version=device.app_version,
            is_active=device.is_active,
            last_active_at=device.last_active_at.isoformat() if device.last_active_at else "",
            created_at=device.created_at.isoformat() if device.created_at else "",
        )
    except DeviceLimitError as e:
        raise HTTPException(
            status_code=403,
            detail={
                "error": "device_limit_reached",
                "limit": e.limit,
                "current": e.current,
                "message": f"You have reached the device limit ({e.limit}) for your plan. Please upgrade to Pro for more devices or deactivate an existing device.",
            }
        )


@router.delete("/devices/{device_id}")
@require_auth
async def deactivate_device(
    device_id: str,
    user: User = Depends(get_current_user)
):
    """Deactivate a device."""
    success = await device_service.deactivate_device(user.id, device_id)
    if not success:
        raise HTTPException(status_code=404, detail="Device not found")
    return {"success": True}


@router.post("/devices/heartbeat")
@require_auth
async def device_heartbeat(
    request: Request,
    user: User = Depends(get_current_user)
):
    """Update device activity timestamp."""
    fingerprint = request.headers.get("X-Device-Fingerprint")
    if fingerprint:
        await device_service.update_activity(user.id, fingerprint)
    return {"success": True}


# ============================================================================
# Referral Endpoints
# ============================================================================

@router.post("/referral/apply")
@require_auth
async def apply_referral(
    request: ApplyReferralRequest,
    user: User = Depends(get_current_user)
):
    """Apply a referral code."""
    from auth.supabase_client import get_supabase_client

    supabase = get_supabase_client()
    if not supabase:
        raise HTTPException(status_code=503, detail="Service unavailable")

    result = supabase.rpc(
        "process_referral",
        {
            "p_referred_id": user.id,
            "p_referral_code": request.referral_code.upper(),
        }
    ).execute()

    if result.data and len(result.data) > 0:
        row = result.data[0]
        if row.get("success"):
            return {"success": True, "message": "Referral applied! You received 100 credits."}
        else:
            raise HTTPException(status_code=400, detail=row.get("message", "Invalid referral code"))

    raise HTTPException(status_code=500, detail="Failed to process referral")


@router.get("/referral/stats")
@require_auth
async def get_referral_stats(user: User = Depends(get_current_user)):
    """Get referral statistics."""
    from auth.supabase_client import get_supabase_client

    supabase = get_supabase_client()
    if not supabase:
        return {"referral_code": None, "referrals_count": 0, "total_credits_earned": 0}

    # Get user's referral code
    profile = supabase.table("user_profiles")\
        .select("referral_code")\
        .eq("id", user.id)\
        .single()\
        .execute()

    # Count referrals
    referrals = supabase.table("referrals")\
        .select("id, referrer_credits_awarded")\
        .eq("referrer_id", user.id)\
        .execute()

    referrals_count = len(referrals.data) if referrals.data else 0
    total_credits = sum(r.get("referrer_credits_awarded", 0) for r in (referrals.data or []))

    return {
        "referral_code": profile.data.get("referral_code") if profile.data else None,
        "referrals_count": referrals_count,
        "total_credits_earned": total_credits,
    }

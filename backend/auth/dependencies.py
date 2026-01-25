"""FastAPI dependencies for authentication."""

from functools import wraps
from typing import Optional
from fastapi import Request, HTTPException, Header, Depends
from .supabase_client import get_supabase_client, is_supabase_configured
from .models import User, UserTier, GuestUser


# Feature tier requirements
FEATURE_REQUIREMENTS = {
    # Free features (require registration)
    "ai_tutor": "free",
    "word_lookup": "free",
    "ai_explain": "free",
    "whisper": "free",
    "translate": "free",

    # Pro features
    "cloud_sync": "pro",
    "export": "pro",
    "notion_sync": "pro",
    "obsidian_sync": "pro",
    "rag_tutor": "pro",
    "unlimited_devices": "pro",
}


async def get_current_user(
    request: Request,
    authorization: Optional[str] = Header(None),
    x_owner_id: Optional[str] = Header(None, alias="X-Owner-Id"),
) -> User:
    """
    Get current authenticated user from JWT token or fallback to owner ID.

    Priority:
    1. JWT token in Authorization header (Supabase auth)
    2. X-Owner-Id header (legacy support)
    3. Guest user
    """
    supabase = get_supabase_client()

    # Try JWT authentication first
    if authorization and authorization.startswith("Bearer ") and supabase:
        token = authorization.replace("Bearer ", "")
        try:
            # Verify JWT and get user
            auth_response = supabase.auth.get_user(token)
            if auth_response and auth_response.user:
                user_id = auth_response.user.id

                # Fetch user profile from database
                profile = supabase.table("user_profiles").select("*").eq("id", user_id).single().execute()

                if profile.data:
                    return User(
                        id=user_id,
                        email=auth_response.user.email,
                        tier=UserTier(profile.data.get("tier", "free")),
                        credits_balance=profile.data.get("credits_balance", 500),
                        credits_monthly_limit=profile.data.get("credits_monthly_limit", 500),
                        credits_reset_at=profile.data.get("credits_reset_at"),
                        referral_code=profile.data.get("referral_code"),
                        referred_by=profile.data.get("referred_by"),
                        created_at=profile.data.get("created_at"),
                    )
        except Exception as e:
            # Token invalid or expired, continue to fallback
            pass

    # Fallback to X-Owner-Id header (legacy/local dev support)
    if x_owner_id and x_owner_id != "guest":
        # For legacy support, treat as free user with default credits
        return User(
            id=x_owner_id,
            tier=UserTier.FREE,
            credits_balance=500,
            credits_monthly_limit=500,
        )

    # Return guest user
    return GuestUser()


async def get_optional_user(
    request: Request,
    authorization: Optional[str] = Header(None),
    x_owner_id: Optional[str] = Header(None, alias="X-Owner-Id"),
) -> Optional[User]:
    """
    Get current user if authenticated, otherwise None.
    Does not raise error for unauthenticated requests.
    """
    try:
        user = await get_current_user(request, authorization, x_owner_id)
        if user.is_guest:
            return None
        return user
    except Exception:
        return None


def require_tier(feature: str):
    """
    Decorator to require a minimum tier for a route.

    Usage:
        @router.post("/export")
        @require_tier("export")
        async def export_data(user: User = Depends(get_current_user)):
            ...
    """
    required_tier = FEATURE_REQUIREMENTS.get(feature, "guest")

    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Find user in kwargs (from Depends)
            user = kwargs.get("user")
            if user is None:
                # Try to get from request
                request = kwargs.get("request")
                if request:
                    user = await get_current_user(request)
                    kwargs["user"] = user

            if user is None:
                raise HTTPException(
                    status_code=401,
                    detail="Authentication required"
                )

            tier_level = {"guest": 0, "free": 1, "pro": 2}
            user_level = tier_level.get(user.tier.value, 0)
            required_level = tier_level.get(required_tier, 0)

            if user_level < required_level:
                raise HTTPException(
                    status_code=403,
                    detail={
                        "error": "upgrade_required",
                        "required_tier": required_tier,
                        "current_tier": user.tier.value,
                        "feature": feature,
                    }
                )

            return await func(*args, **kwargs)
        return wrapper
    return decorator


def require_auth(func):
    """
    Decorator to require any authenticated user (not guest).

    Usage:
        @router.post("/save-word")
        @require_auth
        async def save_word(user: User = Depends(get_current_user)):
            ...
    """
    @wraps(func)
    async def wrapper(*args, **kwargs):
        user = kwargs.get("user")
        if user is None or user.is_guest:
            raise HTTPException(
                status_code=401,
                detail={
                    "error": "auth_required",
                    "message": "Please sign up or log in to use this feature",
                }
            )
        return await func(*args, **kwargs)
    return wrapper

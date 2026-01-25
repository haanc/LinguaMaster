# Auth module for LinguaMaster monetization
from .supabase_client import get_supabase_client, supabase
from .dependencies import get_current_user, get_optional_user, require_tier
from .models import User, UserTier
from .credits import CreditService, CREDIT_COSTS

__all__ = [
    "get_supabase_client",
    "supabase",
    "get_current_user",
    "get_optional_user",
    "require_tier",
    "User",
    "UserTier",
    "CreditService",
    "CREDIT_COSTS",
]

"""User models for authentication and authorization."""

from enum import Enum
from typing import Optional
from datetime import datetime
from pydantic import BaseModel


class UserTier(str, Enum):
    """User subscription tiers."""
    GUEST = "guest"
    FREE = "free"
    PRO = "pro"


class User(BaseModel):
    """Authenticated user model."""
    id: str
    email: Optional[str] = None
    tier: UserTier = UserTier.FREE
    credits_balance: int = 500
    credits_monthly_limit: int = 500
    credits_reset_at: Optional[datetime] = None
    referral_code: Optional[str] = None
    referred_by: Optional[str] = None
    created_at: Optional[datetime] = None

    @property
    def is_pro(self) -> bool:
        return self.tier == UserTier.PRO

    @property
    def is_guest(self) -> bool:
        return self.tier == UserTier.GUEST

    @property
    def can_use_ai(self) -> bool:
        """Check if user can use AI features (not guest)."""
        return self.tier != UserTier.GUEST

    @property
    def has_credits(self) -> bool:
        """Check if user has any credits remaining."""
        return self.credits_balance > 0

    def can_afford(self, cost: int) -> bool:
        """Check if user can afford a specific credit cost."""
        return self.credits_balance >= cost


class GuestUser(User):
    """Guest user with no AI access."""
    def __init__(self):
        super().__init__(
            id="guest",
            tier=UserTier.GUEST,
            credits_balance=0,
            credits_monthly_limit=0
        )


class UserProfile(BaseModel):
    """Full user profile from database."""
    id: str
    tier: UserTier
    credits_balance: int
    credits_monthly_limit: int
    credits_reset_at: Optional[datetime]
    referral_code: Optional[str]
    referred_by: Optional[str]
    created_at: datetime
    updated_at: datetime


class Subscription(BaseModel):
    """Subscription details."""
    id: str
    user_id: str
    lemon_subscription_id: Optional[str]
    plan: str  # 'monthly' | 'yearly'
    status: str  # 'active' | 'cancelled' | 'expired' | 'past_due'
    current_period_start: Optional[datetime]
    current_period_end: Optional[datetime]
    cancel_at_period_end: bool = False
    created_at: datetime


class Device(BaseModel):
    """Registered device."""
    id: str
    user_id: str
    device_name: str
    device_fingerprint: str
    platform: Optional[str]
    app_version: Optional[str]
    is_active: bool = True
    last_active_at: datetime
    created_at: datetime


class CreditLog(BaseModel):
    """Credit transaction log entry."""
    id: str
    user_id: str
    amount: int
    balance_after: int
    action: str
    metadata: dict = {}
    created_at: datetime

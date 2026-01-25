"""Credit system service for managing user credits."""

from typing import Optional, Tuple
from datetime import datetime
from .supabase_client import get_supabase_client, is_supabase_configured
from .models import User, CreditLog


# Credit costs for different actions
CREDIT_COSTS = {
    "word_lookup": 1,
    "ai_explain": 3,
    "ai_tutor": 5,
    "whisper_per_minute": 10,
    "batch_translate_100": 20,
}


class CreditServiceError(Exception):
    """Base error for credit service."""
    pass


class InsufficientCreditsError(CreditServiceError):
    """User doesn't have enough credits."""
    def __init__(self, balance: int, required: int):
        self.balance = balance
        self.required = required
        super().__init__(f"Insufficient credits: {balance} < {required}")


class CreditService:
    """Service for managing user credits."""

    def __init__(self):
        self.supabase = get_supabase_client()

    def is_available(self) -> bool:
        """Check if credit service is available (Supabase configured)."""
        return self.supabase is not None

    async def get_balance(self, user_id: str) -> int:
        """Get current credit balance for a user."""
        if not self.supabase:
            return 500  # Default for local dev

        result = self.supabase.table("user_profiles").select("credits_balance").eq("id", user_id).single().execute()

        if result.data:
            return result.data.get("credits_balance", 0)
        return 0

    async def check_and_deduct(
        self,
        user_id: str,
        action: str,
        use_own_api_key: bool = False,
        metadata: Optional[dict] = None
    ) -> Tuple[bool, int]:
        """
        Check if user has enough credits and deduct if so.

        Args:
            user_id: User ID
            action: Action type (e.g., "word_lookup", "ai_explain")
            use_own_api_key: If True, skip credit check
            metadata: Additional metadata for the log

        Returns:
            Tuple of (success, new_balance)

        Raises:
            InsufficientCreditsError: If user doesn't have enough credits
        """
        # Users with their own API key don't consume credits
        if use_own_api_key:
            return True, -1  # -1 indicates not applicable

        cost = CREDIT_COSTS.get(action, 0)
        if cost == 0:
            return True, -1

        if not self.supabase:
            # Local dev mode - always allow
            return True, 500

        # Use the database function for atomic deduction
        result = self.supabase.rpc(
            "deduct_credits",
            {
                "p_user_id": user_id,
                "p_amount": cost,
                "p_action": action,
                "p_metadata": metadata or {}
            }
        ).execute()

        if result.data and len(result.data) > 0:
            row = result.data[0]
            if row.get("success"):
                return True, row.get("new_balance", 0)
            else:
                error_msg = row.get("error_message", "Unknown error")
                if "Insufficient" in error_msg:
                    current_balance = await self.get_balance(user_id)
                    raise InsufficientCreditsError(current_balance, cost)

        return False, 0

    async def add_credits(
        self,
        user_id: str,
        amount: int,
        action: str,
        metadata: Optional[dict] = None
    ) -> Tuple[bool, int]:
        """
        Add credits to a user's balance.

        Args:
            user_id: User ID
            amount: Amount to add
            action: Action type (e.g., "referral_bonus", "purchase")
            metadata: Additional metadata

        Returns:
            Tuple of (success, new_balance)
        """
        if not self.supabase:
            return True, 500  # Local dev mode

        result = self.supabase.rpc(
            "add_credits",
            {
                "p_user_id": user_id,
                "p_amount": amount,
                "p_action": action,
                "p_metadata": metadata or {}
            }
        ).execute()

        if result.data and len(result.data) > 0:
            row = result.data[0]
            return row.get("success", False), row.get("new_balance", 0)

        return False, 0

    async def get_usage_history(
        self,
        user_id: str,
        limit: int = 50,
        offset: int = 0
    ) -> list[CreditLog]:
        """Get credit usage history for a user."""
        if not self.supabase:
            return []

        result = self.supabase.table("credit_logs")\
            .select("*")\
            .eq("user_id", user_id)\
            .order("created_at", desc=True)\
            .range(offset, offset + limit - 1)\
            .execute()

        if result.data:
            return [CreditLog(**log) for log in result.data]
        return []

    async def get_usage_summary(self, user_id: str) -> dict:
        """Get usage summary for current billing period."""
        if not self.supabase:
            return {
                "total_used": 0,
                "by_action": {},
                "balance": 500,
                "limit": 500,
            }

        # Get user profile
        profile = self.supabase.table("user_profiles")\
            .select("credits_balance, credits_monthly_limit, credits_reset_at")\
            .eq("id", user_id)\
            .single()\
            .execute()

        if not profile.data:
            return {}

        reset_at = profile.data.get("credits_reset_at")

        # Get usage since last reset
        query = self.supabase.table("credit_logs")\
            .select("action, amount")\
            .eq("user_id", user_id)\
            .lt("amount", 0)  # Only deductions

        if reset_at:
            query = query.gte("created_at", reset_at)

        logs = query.execute()

        # Aggregate by action
        by_action = {}
        total_used = 0
        if logs.data:
            for log in logs.data:
                action = log.get("action", "unknown")
                amount = abs(log.get("amount", 0))
                by_action[action] = by_action.get(action, 0) + amount
                total_used += amount

        return {
            "total_used": total_used,
            "by_action": by_action,
            "balance": profile.data.get("credits_balance", 0),
            "limit": profile.data.get("credits_monthly_limit", 500),
            "reset_at": reset_at,
        }


# Global service instance
credit_service = CreditService()

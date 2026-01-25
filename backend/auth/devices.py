"""Device management service for multi-device limits."""

from typing import Optional, List
from datetime import datetime
from .supabase_client import get_supabase_client
from .models import Device, UserTier


# Device limits per tier
DEVICE_LIMITS = {
    UserTier.GUEST: 0,
    UserTier.FREE: 1,
    UserTier.PRO: 3,
}


class DeviceLimitError(Exception):
    """User has reached device limit."""
    def __init__(self, limit: int, current: int):
        self.limit = limit
        self.current = current
        super().__init__(f"Device limit reached: {current}/{limit}")


class DeviceService:
    """Service for managing user devices."""

    def __init__(self):
        self.supabase = get_supabase_client()

    def is_available(self) -> bool:
        """Check if device service is available."""
        return self.supabase is not None

    async def get_devices(self, user_id: str) -> List[Device]:
        """Get all devices for a user."""
        if not self.supabase:
            return []

        result = self.supabase.table("devices")\
            .select("*")\
            .eq("user_id", user_id)\
            .eq("is_active", True)\
            .order("last_active_at", desc=True)\
            .execute()

        if result.data:
            return [Device(**d) for d in result.data]
        return []

    async def register_device(
        self,
        user_id: str,
        device_name: str,
        device_fingerprint: str,
        platform: Optional[str] = None,
        app_version: Optional[str] = None,
        tier: UserTier = UserTier.FREE,
    ) -> Device:
        """
        Register a new device or update existing one.

        Args:
            user_id: User ID
            device_name: Human-readable device name
            device_fingerprint: Unique device identifier
            platform: OS platform
            app_version: Application version
            tier: User's tier for limit checking

        Returns:
            Registered device

        Raises:
            DeviceLimitError: If device limit reached
        """
        if not self.supabase:
            # Local dev mode - return mock device
            return Device(
                id="local-dev",
                user_id=user_id,
                device_name=device_name,
                device_fingerprint=device_fingerprint,
                platform=platform,
                app_version=app_version,
                is_active=True,
                last_active_at=datetime.now(),
                created_at=datetime.now(),
            )

        # Check if device already exists
        existing = self.supabase.table("devices")\
            .select("*")\
            .eq("user_id", user_id)\
            .eq("device_fingerprint", device_fingerprint)\
            .single()\
            .execute()

        if existing.data:
            # Update existing device
            updated = self.supabase.table("devices")\
                .update({
                    "device_name": device_name,
                    "platform": platform,
                    "app_version": app_version,
                    "is_active": True,
                    "last_active_at": datetime.now().isoformat(),
                })\
                .eq("id", existing.data["id"])\
                .execute()

            if updated.data:
                return Device(**updated.data[0])

        # New device - check limit
        current_devices = await self.get_devices(user_id)
        active_count = len(current_devices)
        limit = DEVICE_LIMITS.get(tier, 1)

        if active_count >= limit:
            raise DeviceLimitError(limit, active_count)

        # Register new device
        result = self.supabase.table("devices")\
            .insert({
                "user_id": user_id,
                "device_name": device_name,
                "device_fingerprint": device_fingerprint,
                "platform": platform,
                "app_version": app_version,
                "is_active": True,
                "last_active_at": datetime.now().isoformat(),
            })\
            .execute()

        if result.data:
            return Device(**result.data[0])

        raise Exception("Failed to register device")

    async def deactivate_device(self, user_id: str, device_id: str) -> bool:
        """Deactivate a device (remove from active devices)."""
        if not self.supabase:
            return True

        result = self.supabase.table("devices")\
            .update({"is_active": False})\
            .eq("id", device_id)\
            .eq("user_id", user_id)\
            .execute()

        return len(result.data) > 0 if result.data else False

    async def update_activity(self, user_id: str, device_fingerprint: str) -> bool:
        """Update last activity time for a device."""
        if not self.supabase:
            return True

        result = self.supabase.table("devices")\
            .update({"last_active_at": datetime.now().isoformat()})\
            .eq("user_id", user_id)\
            .eq("device_fingerprint", device_fingerprint)\
            .execute()

        return len(result.data) > 0 if result.data else False

    async def get_device_count(self, user_id: str) -> int:
        """Get count of active devices for a user."""
        devices = await self.get_devices(user_id)
        return len(devices)

    async def can_add_device(self, user_id: str, tier: UserTier) -> bool:
        """Check if user can add another device."""
        if not self.supabase:
            return True

        current = await self.get_device_count(user_id)
        limit = DEVICE_LIMITS.get(tier, 1)
        return current < limit


# Global service instance
device_service = DeviceService()

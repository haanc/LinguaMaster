"""Supabase client configuration."""

import os
from typing import Optional
from functools import lru_cache
from supabase import create_client, Client

# Environment variables
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "")


class SupabaseClientError(Exception):
    """Error when Supabase client is not configured."""
    pass


@lru_cache()
def get_supabase_client() -> Optional[Client]:
    """
    Get Supabase client with service role key for server-side operations.

    Returns:
        Supabase client or None if not configured.
    """
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return None

    return create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


def get_supabase_anon_client() -> Optional[Client]:
    """
    Get Supabase client with anon key for client-like operations.
    """
    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        return None

    return create_client(SUPABASE_URL, SUPABASE_ANON_KEY)


# Global client instance (may be None if not configured)
supabase = get_supabase_client()


def is_supabase_configured() -> bool:
    """Check if Supabase is properly configured."""
    return supabase is not None


def require_supabase() -> Client:
    """
    Get Supabase client, raising error if not configured.

    Use this in routes that require Supabase.
    """
    client = get_supabase_client()
    if client is None:
        raise SupabaseClientError(
            "Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
        )
    return client

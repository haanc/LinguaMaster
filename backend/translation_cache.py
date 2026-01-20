"""
Translation Cache Service
Provides caching layer for subtitle translations to reduce AI API calls.
"""

from typing import Dict, List, Optional, Tuple
import hashlib


class TranslationCache:
    """
    In-memory cache for translations.
    Uses text hash as key to avoid duplicate translations across different segments.
    """

    def __init__(self, max_size: int = 10000):
        self._cache: Dict[str, str] = {}
        self._max_size = max_size

    def _make_key(self, text: str, target_language: str) -> str:
        """Create a cache key from text and target language."""
        content = f"{text.strip().lower()}:{target_language.lower()}"
        return hashlib.md5(content.encode()).hexdigest()

    def get(self, text: str, target_language: str) -> Optional[str]:
        """Get cached translation if available."""
        key = self._make_key(text, target_language)
        return self._cache.get(key)

    def set(self, text: str, target_language: str, translation: str) -> None:
        """Cache a translation."""
        # Simple LRU: if cache is full, clear oldest half
        if len(self._cache) >= self._max_size:
            keys_to_remove = list(self._cache.keys())[: self._max_size // 2]
            for k in keys_to_remove:
                del self._cache[k]

        key = self._make_key(text, target_language)
        self._cache[key] = translation

    def bulk_get(
        self, texts: List[str], target_language: str
    ) -> Tuple[Dict[int, str], List[Tuple[int, str]]]:
        """
        Check cache for multiple texts at once.

        Returns:
            - found: Dict mapping index -> translation (for cached items)
            - missing: List of (index, text) tuples that need translation
        """
        found: Dict[int, str] = {}
        missing: List[Tuple[int, str]] = []

        for i, text in enumerate(texts):
            cached = self.get(text, target_language)
            if cached:
                found[i] = cached
            else:
                missing.append((i, text))

        return found, missing

    def bulk_set(
        self, items: List[Tuple[str, str]], target_language: str
    ) -> None:
        """
        Cache multiple translations at once.

        Args:
            items: List of (text, translation) tuples
            target_language: Target language
        """
        for text, translation in items:
            self.set(text, target_language, translation)

    def clear(self) -> None:
        """Clear all cached translations."""
        self._cache.clear()

    @property
    def size(self) -> int:
        """Current cache size."""
        return len(self._cache)


# Global cache instance
_translation_cache: Optional[TranslationCache] = None


def get_translation_cache() -> TranslationCache:
    """Get global translation cache (lazy initialized)."""
    global _translation_cache
    if _translation_cache is None:
        _translation_cache = TranslationCache()
    return _translation_cache

/**
 * Unified language definitions for both UI display and AI translation targets.
 * This is the single source of truth for supported languages.
 */

export interface Language {
  code: string;      // ISO 639-1 code (e.g., 'en', 'zh')
  name: string;      // English name for API calls
  nativeName: string; // Native name for display
}

export const SUPPORTED_LANGUAGES: Language[] = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'zh', name: 'Chinese', nativeName: '中文' },
  { code: 'es', name: 'Spanish', nativeName: 'Español' },
  { code: 'fr', name: 'French', nativeName: 'Français' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語' },
  { code: 'de', name: 'German', nativeName: 'Deutsch' },
];

// For backwards compatibility with existing code that uses string arrays
export const LANGUAGE_NAMES = SUPPORTED_LANGUAGES.map(l => l.name);

// Map from language code to Language object
export const LANGUAGE_BY_CODE = Object.fromEntries(
  SUPPORTED_LANGUAGES.map(l => [l.code, l])
) as Record<string, Language>;

// Map from language name to Language object
export const LANGUAGE_BY_NAME = Object.fromEntries(
  SUPPORTED_LANGUAGES.map(l => [l.name, l])
) as Record<string, Language>;

// Default language
export const DEFAULT_LANGUAGE = 'en';

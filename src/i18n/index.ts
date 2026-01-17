import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from './locales/en.json';
import zh from './locales/zh.json';
import es from './locales/es.json';
import fr from './locales/fr.json';
import ja from './locales/ja.json';
import de from './locales/de.json';

import { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES } from './languages';

const resources = {
  en: { translation: en },
  zh: { translation: zh },
  es: { translation: es },
  fr: { translation: fr },
  ja: { translation: ja },
  de: { translation: de },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: DEFAULT_LANGUAGE,
    supportedLngs: SUPPORTED_LANGUAGES.map(l => l.code),

    detection: {
      // Detection order: localStorage first, then browser language
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'fluent-learner-language',
      caches: ['localStorage'],
    },

    interpolation: {
      escapeValue: false, // React already escapes
    },

    react: {
      useSuspense: false, // Disable suspense for Electron compatibility
    },
  });

export default i18n;

import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import en from './locales/en';
import type { Translations } from './locales/en';

/* ── Supported locales ─────────────────────────────────── */

export type Locale = 'en' | 'de' | 'es' | 'fr';

const SUPPORTED_LOCALES: Locale[] = ['en', 'de', 'es', 'fr'];
const LOCALE_LABELS: Record<Locale, string> = { en: 'EN', de: 'DE', es: 'ES', fr: 'FR' };
const LOCALE_NAMES: Record<Locale, string> = { en: 'English', de: 'Deutsch', es: 'Español', fr: 'Français' };

export { SUPPORTED_LOCALES, LOCALE_LABELS, LOCALE_NAMES };

/* ── Type-safe flat key derivation ─────────────────────── */

type FlattenKeys<T, Prefix extends string = ''> = T extends string
  ? Prefix
  : { [K in keyof T & string]: FlattenKeys<T[K], Prefix extends '' ? K : `${Prefix}.${K}`> }[keyof T & string];

export type TranslationKey = FlattenKeys<Translations>;

/* ── Lazy-loaded locale modules ────────────────────────── */

const localeLoaders: Record<Locale, () => Promise<{ default: Translations }>> = {
  en: () => Promise.resolve({ default: en }),
  de: () => import('./locales/de'),
  es: () => import('./locales/es'),
  fr: () => import('./locales/fr'),
};

const localeCache: Partial<Record<Locale, Translations>> = { en };

async function loadLocale(locale: Locale): Promise<Translations> {
  if (localeCache[locale]) return localeCache[locale]!;
  const mod = await localeLoaders[locale]();
  localeCache[locale] = mod.default;
  return mod.default;
}

/* ── Resolve nested key from translations object ───────── */

function resolve(obj: unknown, key: string): string | undefined {
  const parts = key.split('.');
  let cur: unknown = obj;
  for (const part of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return typeof cur === 'string' ? cur : undefined;
}

/* ── Interpolation: 'Hello {name}' + { name: 'World' } ── */

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    const val = vars[key];
    return val !== undefined ? String(val) : `{${key}}`;
  });
}

/* ── Context + Hook ────────────────────────────────────── */

export interface I18nContextType {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
}

export const I18nContext = createContext<I18nContextType | null>(null);

export function useI18n(): I18nContextType {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}

/* ── Detect initial locale ─────────────────────────────── */

function detectLocale(): Locale {
  // 1. Check localStorage
  try {
    const saved = localStorage.getItem('language');
    if (saved && SUPPORTED_LOCALES.includes(saved as Locale)) return saved as Locale;
  } catch { /* ignore */ }

  // 2. Check browser language
  const browserLang = navigator.language.split('-')[0];
  if (SUPPORTED_LOCALES.includes(browserLang as Locale)) return browserLang as Locale;

  // 3. Default
  return 'en';
}

/* ── Provider hook (call in App.tsx) ───────────────────── */

export function useI18nProvider(): I18nContextType {
  const [locale, setLocaleState] = useState<Locale>(detectLocale);
  const [translations, setTranslations] = useState<Translations>(en);

  // Load translations when locale changes
  useEffect(() => {
    let cancelled = false;
    loadLocale(locale).then((t) => {
      if (!cancelled) setTranslations(t);
    });
    return () => { cancelled = true; };
  }, [locale]);

  // Persist + update document lang
  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    try { localStorage.setItem('language', l); } catch { /* ignore */ }
    document.documentElement.lang = l;
  }, []);

  // Set initial document lang
  useEffect(() => {
    document.documentElement.lang = locale;
  }, []);

  const t = useCallback(
    (key: TranslationKey, vars?: Record<string, string | number>): string => {
      // Try current locale
      const value = resolve(translations, key);
      if (value) return interpolate(value, vars);
      // Fallback to English
      const fallback = resolve(en, key);
      if (fallback) return interpolate(fallback, vars);
      // Return raw key
      return key;
    },
    [translations],
  );

  return { locale, setLocale, t };
}

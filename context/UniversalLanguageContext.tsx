"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  UNIVERSAL_LANGUAGE_COOKIE_NAME,
  UNIVERSAL_LANGUAGE_STORAGE_KEY,
  findUniversalLanguage,
  normalizeUniversalLanguage,
  type UniversalLanguageCode,
} from "@/lib/i18n/languages";

type UniversalLanguageContextValue = {
  selectedLanguage: UniversalLanguageCode | null;
  languageLoaded: boolean;
  setSelectedLanguage: (code: UniversalLanguageCode) => void;
  resetToAuto: () => void;
};

const UniversalLanguageContext =
  createContext<UniversalLanguageContextValue | null>(null);

function writeLanguageCookie(code: UniversalLanguageCode | null) {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  if (!code) {
    document.cookie = `${UNIVERSAL_LANGUAGE_COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
    return;
  }

  document.cookie = `${UNIVERSAL_LANGUAGE_COOKIE_NAME}=${encodeURIComponent(
    code
  )}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
}

export function UniversalLanguageProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [selectedLanguage, setSelectedLanguageState] =
    useState<UniversalLanguageCode | null>(null);
  const [languageLoaded, setLanguageLoaded] = useState(false);

  useEffect(() => {
    let stored: UniversalLanguageCode | null = null;
    try {
      stored = normalizeUniversalLanguage(
        window.localStorage.getItem(UNIVERSAL_LANGUAGE_STORAGE_KEY)
      );
    } catch {
      // Private browsing can block storage; Auto remains the safe default.
    }
    setSelectedLanguageState(stored);
    setLanguageLoaded(true);
  }, []);

  useEffect(() => {
    if (!languageLoaded) return;
    const selected = findUniversalLanguage(selectedLanguage);
    const browserLanguage =
      typeof navigator.language === "string" && navigator.language.trim()
        ? navigator.language
        : "en";

    document.documentElement.lang = selected?.htmlLang ?? browserLanguage;
    document.documentElement.dataset.aoe2warLanguage =
      selectedLanguage ?? "auto";
  }, [languageLoaded, selectedLanguage]);

  useEffect(() => {
    function handleStorage(event: StorageEvent) {
      if (event.key !== UNIVERSAL_LANGUAGE_STORAGE_KEY) return;
      setSelectedLanguageState(normalizeUniversalLanguage(event.newValue));
    }

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const setSelectedLanguage = useCallback((code: UniversalLanguageCode) => {
    setSelectedLanguageState(code);
    try {
      window.localStorage.setItem(UNIVERSAL_LANGUAGE_STORAGE_KEY, code);
    } catch {
      // The in-memory choice still works when persistent storage is unavailable.
    }
    writeLanguageCookie(code);
  }, []);

  const resetToAuto = useCallback(() => {
    setSelectedLanguageState(null);
    try {
      window.localStorage.removeItem(UNIVERSAL_LANGUAGE_STORAGE_KEY);
    } catch {
      // Auto still applies for the current session.
    }
    writeLanguageCookie(null);
  }, []);

  const value = useMemo(
    () => ({
      selectedLanguage,
      languageLoaded,
      setSelectedLanguage,
      resetToAuto,
    }),
    [
      languageLoaded,
      resetToAuto,
      selectedLanguage,
      setSelectedLanguage,
    ]
  );

  return (
    <UniversalLanguageContext.Provider value={value}>
      {children}
    </UniversalLanguageContext.Provider>
  );
}

export function useUniversalLanguage() {
  const context = useContext(UniversalLanguageContext);
  if (!context) {
    throw new Error(
      "useUniversalLanguage must be used inside UniversalLanguageProvider"
    );
  }
  return context;
}

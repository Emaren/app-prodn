"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import { useUserAuth } from "@/context/UserAuthContext";
import {
  DEFAULT_LOBBY_TEXT_COLOR,
  DEFAULT_LOBBY_THEME,
  DEFAULT_LOBBY_VIEW,
  getLobbyPageBackground,
  getLobbyPresentationTone,
  readStoredLobbyTextColor,
  readStoredLobbyTheme,
  readStoredLobbyViewMode,
  writeStoredLobbyTextColor,
  writeStoredLobbyTheme,
  writeStoredLobbyViewMode,
  type LobbyTextColor,
  type LobbyThemeKey,
  type LobbyViewMode,
} from "@/components/lobby/lobbyPresentation";
import {
  fetchUserAppearancePreference,
  saveUserAppearancePreference,
} from "@/lib/userAppearanceClient";

type LobbyAppearanceContextValue = {
  themeKey: LobbyThemeKey;
  setThemeKey: (themeKey: LobbyThemeKey) => void;
  viewMode: LobbyViewMode;
  setViewMode: (viewMode: LobbyViewMode) => void;
  textColor: LobbyTextColor;
  setTextColor: (textColor: LobbyTextColor) => void;
  appearanceLoaded: boolean;
  presentationTone: ReturnType<typeof getLobbyPresentationTone>;
  pageStyle: CSSProperties;
};

const LobbyAppearanceContext = createContext<LobbyAppearanceContextValue | undefined>(undefined);

export function LobbyAppearanceProvider({ children }: { children: ReactNode }) {
  const { user } = useUserAuth();
  const [themeKey, setThemeKey] = useState<LobbyThemeKey>(DEFAULT_LOBBY_THEME);
  const [viewMode, setViewMode] = useState<LobbyViewMode>(DEFAULT_LOBBY_VIEW);
  const [textColor, setTextColor] = useState<LobbyTextColor>(DEFAULT_LOBBY_TEXT_COLOR);
  const [appearanceLoaded, setAppearanceLoaded] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let cancelled = false;
    const storedTheme = readStoredLobbyTheme();
    const storedView = readStoredLobbyViewMode();
    const storedTextColor = readStoredLobbyTextColor();
    setAppearanceLoaded(false);

    const hydrateAppearance = async () => {
      if (!user?.uid) {
        if (!cancelled) {
          setThemeKey(storedTheme);
          setViewMode(storedView);
          setTextColor(storedTextColor);
          setAppearanceLoaded(true);
        }
        return;
      }

      try {
        const preference = await fetchUserAppearancePreference();
        if (cancelled) return;
        setThemeKey(preference.themeKey);
        setViewMode(preference.viewMode);
        setTextColor(preference.textColor);
      } catch (error) {
        console.warn("Failed to hydrate appearance from account:", error);
        if (cancelled) return;
        setThemeKey(storedTheme);
        setViewMode(storedView);
        setTextColor(storedTextColor);
      } finally {
        if (!cancelled) {
          setAppearanceLoaded(true);
        }
      }
    };

    void hydrateAppearance();

    return () => {
      cancelled = true;
    };
  }, [user?.uid]);

  useEffect(() => {
    writeStoredLobbyTheme(themeKey);
  }, [themeKey]);

  useEffect(() => {
    writeStoredLobbyViewMode(viewMode);
  }, [viewMode]);

  useEffect(() => {
    writeStoredLobbyTextColor(textColor);
  }, [textColor]);

  useEffect(() => {
    if (!appearanceLoaded || !user?.uid) return;

    void saveUserAppearancePreference({ themeKey, viewMode, textColor }).catch((error) => {
      console.warn("Failed to save appearance preference:", error);
    });
  }, [appearanceLoaded, textColor, themeKey, user?.uid, viewMode]);

  const presentationTone = useMemo(
    () => getLobbyPresentationTone(themeKey, viewMode),
    [themeKey, viewMode]
  );

  const pageStyle = useMemo<CSSProperties>(
    () => ({
      backgroundImage: getLobbyPageBackground(themeKey, viewMode),
      backgroundColor: "#020617",
      backgroundPosition: "center top",
      backgroundRepeat: "no-repeat",
      backgroundSize: "cover",
    }),
    [themeKey, viewMode]
  );

  return (
    <LobbyAppearanceContext.Provider
      value={{
        themeKey,
        setThemeKey,
        viewMode,
        setViewMode,
        textColor,
        setTextColor,
        appearanceLoaded,
        presentationTone,
        pageStyle,
      }}
    >
      {children}
    </LobbyAppearanceContext.Provider>
  );
}

export function useLobbyAppearance() {
  const context = useContext(LobbyAppearanceContext);
  if (!context) {
    throw new Error("useLobbyAppearance must be used within LobbyAppearanceProvider");
  }
  return context;
}

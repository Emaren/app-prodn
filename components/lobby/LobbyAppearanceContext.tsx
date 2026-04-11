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
  DEFAULT_LOBBY_TILE_THEME,
  DEFAULT_LOBBY_THEME,
  DEFAULT_LOBBY_VIEW,
  getLobbyPageBackground,
  getLobbyPresentationTone,
  readStoredLobbyTextColor,
  readStoredLobbyTileTheme,
  readStoredLobbyTheme,
  readStoredLobbyViewMode,
  writeStoredLobbyTextColor,
  writeStoredLobbyTileTheme,
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
import {
  detectBrowserTimeZone,
  readStoredBrowserTimeZone,
  readStoredTimeDisplayMode,
  writeStoredBrowserTimeZone,
  writeStoredTimeDisplayMode,
  type TimeDisplayMode,
} from "@/lib/timeDisplay";

type LobbyAppearanceContextValue = {
  themeKey: LobbyThemeKey;
  setThemeKey: (themeKey: LobbyThemeKey) => void;
  tileThemeKey: LobbyThemeKey;
  setTileThemeKey: (themeKey: LobbyThemeKey) => void;
  viewMode: LobbyViewMode;
  setViewMode: (viewMode: LobbyViewMode) => void;
  textColor: LobbyTextColor;
  setTextColor: (textColor: LobbyTextColor) => void;
  timeDisplayMode: TimeDisplayMode;
  setTimeDisplayMode: (timeDisplayMode: TimeDisplayMode) => void;
  browserTimeZone: string | null;
  appearanceLoaded: boolean;
  presentationTone: ReturnType<typeof getLobbyPresentationTone>;
  pageStyle: CSSProperties;
};

const LobbyAppearanceContext = createContext<LobbyAppearanceContextValue | undefined>(undefined);

export function LobbyAppearanceProvider({ children }: { children: ReactNode }) {
  const { user } = useUserAuth();
  const [themeKey, setThemeKey] = useState<LobbyThemeKey>(DEFAULT_LOBBY_THEME);
  const [tileThemeKey, setTileThemeKey] = useState<LobbyThemeKey>(DEFAULT_LOBBY_TILE_THEME);
  const [viewMode, setViewMode] = useState<LobbyViewMode>(DEFAULT_LOBBY_VIEW);
  const [textColor, setTextColor] = useState<LobbyTextColor>(DEFAULT_LOBBY_TEXT_COLOR);
  const [timeDisplayMode, setTimeDisplayMode] = useState<TimeDisplayMode>("utc");
  const [browserTimeZone, setBrowserTimeZone] = useState<string | null>(null);
  const [appearanceLoaded, setAppearanceLoaded] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let cancelled = false;
    const storedTheme = readStoredLobbyTheme();
    const storedTileTheme = readStoredLobbyTileTheme();
    const storedView = readStoredLobbyViewMode();
    const storedTextColor = readStoredLobbyTextColor();
    const storedTimeDisplayMode = readStoredTimeDisplayMode();
    const detectedBrowserTimeZone =
      detectBrowserTimeZone() || readStoredBrowserTimeZone();
    setBrowserTimeZone(detectedBrowserTimeZone);
    setAppearanceLoaded(false);

    const hydrateAppearance = async () => {
      if (!user?.uid) {
        if (!cancelled) {
          setThemeKey(storedTheme);
          setTileThemeKey(storedTileTheme);
          setViewMode(storedView);
          setTextColor(storedTextColor);
          setTimeDisplayMode(storedTimeDisplayMode);
          setAppearanceLoaded(true);
        }
        return;
      }

      try {
        const preference = await fetchUserAppearancePreference();
        if (cancelled) return;
        setThemeKey(preference.themeKey);
        setTileThemeKey(preference.tileThemeKey);
        setViewMode(preference.viewMode);
        setTextColor(preference.textColor);
        setTimeDisplayMode(preference.timeDisplayMode);
        setBrowserTimeZone(preference.timezoneOverride || detectedBrowserTimeZone);
      } catch (error) {
        console.warn("Failed to hydrate appearance from account:", error);
        if (cancelled) return;
        setThemeKey(storedTheme);
        setTileThemeKey(storedTileTheme);
        setViewMode(storedView);
        setTextColor(storedTextColor);
        setTimeDisplayMode(storedTimeDisplayMode);
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
    writeStoredLobbyTileTheme(tileThemeKey);
  }, [tileThemeKey]);

  useEffect(() => {
    writeStoredLobbyViewMode(viewMode);
  }, [viewMode]);

  useEffect(() => {
    writeStoredLobbyTextColor(textColor);
  }, [textColor]);

  useEffect(() => {
    writeStoredTimeDisplayMode(timeDisplayMode);
  }, [timeDisplayMode]);

  useEffect(() => {
    writeStoredBrowserTimeZone(browserTimeZone);
  }, [browserTimeZone]);

  useEffect(() => {
    if (!appearanceLoaded || !user?.uid) return;

    void saveUserAppearancePreference({
      themeKey,
      tileThemeKey,
      viewMode,
      textColor,
      timeDisplayMode,
      timezoneOverride: browserTimeZone,
    }).catch((error) => {
      console.warn("Failed to save appearance preference:", error);
    });
  }, [
    appearanceLoaded,
    browserTimeZone,
    textColor,
    themeKey,
    tileThemeKey,
    timeDisplayMode,
    user?.uid,
    viewMode,
  ]);

  const presentationTone = useMemo(
    () => getLobbyPresentationTone(tileThemeKey, viewMode),
    [tileThemeKey, viewMode]
  );

  useEffect(() => {
    if (typeof document === "undefined") return;

    const html = document.documentElement;
    const body = document.body;
    const previousHtmlBackground = html.style.background;
    const previousHtmlColor = html.style.backgroundColor;
    const previousHtmlBackgroundImage = html.style.backgroundImage;
    const previousHtmlAttachment = html.style.backgroundAttachment;
    const previousHtmlRepeat = html.style.backgroundRepeat;
    const previousHtmlSize = html.style.backgroundSize;
    const previousHtmlPosition = html.style.backgroundPosition;
    const previousBodyBackgroundImage = body.style.backgroundImage;
    const previousBodyColor = body.style.backgroundColor;
    const previousBodyAttachment = body.style.backgroundAttachment;
    const previousBodyRepeat = body.style.backgroundRepeat;
    const previousBodySize = body.style.backgroundSize;
    const previousBodyPosition = body.style.backgroundPosition;
    const backgroundImage = getLobbyPageBackground(themeKey, viewMode);

    html.style.backgroundImage = backgroundImage;
    html.style.backgroundAttachment = "fixed";
    html.style.backgroundRepeat = "no-repeat";
    html.style.backgroundSize = "cover";
    html.style.backgroundPosition = "center top";
    html.style.backgroundColor = "#020617";
    body.style.backgroundImage = backgroundImage;
    body.style.backgroundColor = "#020617";
    body.style.backgroundAttachment = "fixed";
    body.style.backgroundRepeat = "no-repeat";
    body.style.backgroundSize = "cover";
    body.style.backgroundPosition = "center top";

    return () => {
      html.style.background = previousHtmlBackground;
      html.style.backgroundImage = previousHtmlBackgroundImage;
      html.style.backgroundColor = previousHtmlColor;
      html.style.backgroundAttachment = previousHtmlAttachment;
      html.style.backgroundRepeat = previousHtmlRepeat;
      html.style.backgroundSize = previousHtmlSize;
      html.style.backgroundPosition = previousHtmlPosition;
      body.style.backgroundImage = previousBodyBackgroundImage;
      body.style.backgroundColor = previousBodyColor;
      body.style.backgroundAttachment = previousBodyAttachment;
      body.style.backgroundRepeat = previousBodyRepeat;
      body.style.backgroundSize = previousBodySize;
      body.style.backgroundPosition = previousBodyPosition;
    };
  }, [themeKey, viewMode]);

  const pageStyle = useMemo<CSSProperties>(
    () => ({
      backgroundImage: getLobbyPageBackground(themeKey, viewMode),
      backgroundColor: "#020617",
      backgroundAttachment: "fixed",
      backgroundRepeat: "no-repeat",
      backgroundPosition: "center top",
      backgroundSize: "cover",
    }),
    [themeKey, viewMode]
  );

  return (
    <LobbyAppearanceContext.Provider
      value={{
        themeKey,
        setThemeKey,
        tileThemeKey,
        setTileThemeKey,
        viewMode,
        setViewMode,
        textColor,
        setTextColor,
        timeDisplayMode,
        setTimeDisplayMode,
        browserTimeZone,
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

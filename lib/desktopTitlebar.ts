// Colors pushed to the Electron title-bar overlay, matching each theme's `--bg`/`--ink`.
export type TitlebarColors = { color: string; symbolColor: string };

declare global {
  interface Window {
    /** Bridge exposed by electron/preload.cjs when running in the desktop app. */
    smoketestDesktop?: {
      platform: string;
      setTitleBarColors: (colors: TitlebarColors) => Promise<void>;
    };
  }
}

const TITLEBAR_COLORS: Record<"smoke" | "ember", TitlebarColors> = {
  ember: { color: "#0c0e0d", symbolColor: "#e8e7df" },
  smoke: { color: "#f4f3ed", symbolColor: "#242724" },
};

export function titlebarColorsForTheme(
  theme: "smoke" | "ember",
): TitlebarColors {
  return TITLEBAR_COLORS[theme];
}

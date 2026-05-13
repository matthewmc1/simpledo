import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type Density = "comfortable" | "compact";
export type AIProminence = "quiet" | "balanced" | "loud";

export interface Tweaks {
  accent: string;
  density: Density;
  aiProminence: AIProminence;
}

export const ACCENT_OPTIONS: { value: string; label: string }[] = [
  { value: "#a85a2c", label: "Copper" },
  { value: "#2d5a3d", label: "Forest" },
  { value: "#3d4a8a", label: "Indigo" },
  { value: "#15140f", label: "Ink" },
];

const DEFAULTS: Tweaks = {
  accent: "#a85a2c",
  density: "comfortable",
  aiProminence: "balanced",
};

const STORAGE_KEY = "simply-do.tweaks";

interface Ctx {
  tweaks: Tweaks;
  setTweak: <K extends keyof Tweaks>(k: K, v: Tweaks[K]) => void;
}

const TweaksContext = createContext<Ctx | null>(null);

function load(): Tweaks {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<Tweaks>;
    return { ...DEFAULTS, ...parsed };
  } catch {
    return DEFAULTS;
  }
}

export function TweaksProvider({ children }: { children: ReactNode }) {
  const [tweaks, setTweaks] = useState<Tweaks>(() => load());

  useEffect(() => {
    document.documentElement.style.setProperty("--accent", tweaks.accent);
    document.documentElement.setAttribute("data-density", tweaks.density);
    document.documentElement.setAttribute("data-ai-prominence", tweaks.aiProminence);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tweaks));
    } catch {
      /* ignore */
    }
  }, [tweaks]);

  const setTweak = useCallback(
    <K extends keyof Tweaks>(k: K, v: Tweaks[K]) => {
      setTweaks((prev) => ({ ...prev, [k]: v }));
    },
    [],
  );

  const value = useMemo<Ctx>(() => ({ tweaks, setTweak }), [tweaks, setTweak]);

  return <TweaksContext.Provider value={value}>{children}</TweaksContext.Provider>;
}

export function useTweaks(): Ctx {
  const ctx = useContext(TweaksContext);
  if (!ctx) throw new Error("useTweaks must be used inside TweaksProvider");
  return ctx;
}

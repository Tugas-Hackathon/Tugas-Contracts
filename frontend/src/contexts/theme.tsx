import { createContext, useContext, useState } from "react"

type Theme = "light" | "dark"

const ThemeContext = createContext<{ theme: Theme; toggle: () => void }>({
  theme: "dark",
  toggle: () => {},
})

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem("tugas_theme") as Theme) ?? "dark"
  )

  function toggle() {
    setTheme(t => {
      const next = t === "dark" ? "light" : "dark"
      localStorage.setItem("tugas_theme", next)
      return next
    })
  }

  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() { return useContext(ThemeContext) }

/* Smart Glass OS tokens */
export const vars = {
  dark: {
    "--page-bg": "#08070d",
    "--glow-1": "rgba(139,92,246,0.22)",
    "--glow-2": "rgba(45,212,191,0.10)",
    "--glow-3": "rgba(109,40,217,0.16)",

    "--panel": "rgba(255,255,255,0.028)",
    "--panel-solid": "#131120",
    "--panel-border": "rgba(255,255,255,0.075)",
    "--panel-inset": "rgba(255,255,255,0.05)",

    "--surface": "rgba(255,255,255,0.022)",
    "--surface-hover": "rgba(255,255,255,0.055)",
    "--surface-border": "rgba(255,255,255,0.06)",

    "--text": "#eceaf5",
    "--text-dim": "#9b96b4",
    "--text-faint": "#66617f",

    "--accent": "#8b5cf6",
    "--accent-bright": "#a78bfa",
    "--accent-soft": "rgba(139,92,246,0.14)",
    "--accent-border": "rgba(167,139,250,0.38)",
    "--accent-glow": "rgba(139,92,246,0.45)",

    "--teal": "#2dd4bf",
    "--teal-soft": "rgba(45,212,191,0.12)",
    "--teal-border": "rgba(45,212,191,0.32)",

    "--green": "#22c55e",
    "--amber": "#f59e0b",
    "--red": "#f87171",

    "--input-bg": "rgba(255,255,255,0.04)",
    "--input-border": "rgba(255,255,255,0.09)",

    "--msg-user-bg": "linear-gradient(135deg,#7c3aed,#6d28d9)",
    "--msg-user-text": "#ffffff",
    "--msg-ai-bg": "rgba(255,255,255,0.045)",
    "--msg-ai-text": "#eceaf5",
  },
  light: {
    "--page-bg": "#eceaf4",
    "--glow-1": "rgba(139,92,246,0.20)",
    "--glow-2": "rgba(45,212,191,0.14)",
    "--glow-3": "rgba(167,139,250,0.16)",

    "--panel": "rgba(255,255,255,0.72)",
    "--panel-solid": "#ffffff",
    "--panel-border": "rgba(23,16,48,0.09)",
    "--panel-inset": "rgba(255,255,255,0.9)",

    "--surface": "rgba(23,16,48,0.022)",
    "--surface-hover": "rgba(23,16,48,0.055)",
    "--surface-border": "rgba(23,16,48,0.07)",

    "--text": "#1a1530",
    "--text-dim": "#5f5980",
    "--text-faint": "#8b86a3",

    "--accent": "#7c3aed",
    "--accent-bright": "#6d28d9",
    "--accent-soft": "rgba(124,58,237,0.10)",
    "--accent-border": "rgba(124,58,237,0.30)",
    "--accent-glow": "rgba(124,58,237,0.30)",

    "--teal": "#0d9488",
    "--teal-soft": "rgba(13,148,136,0.10)",
    "--teal-border": "rgba(13,148,136,0.28)",

    "--green": "#16a34a",
    "--amber": "#d97706",
    "--red": "#dc2626",

    "--input-bg": "rgba(255,255,255,0.75)",
    "--input-border": "rgba(23,16,48,0.12)",

    "--msg-user-bg": "linear-gradient(135deg,#7c3aed,#6d28d9)",
    "--msg-user-text": "#ffffff",
    "--msg-ai-bg": "rgba(23,16,48,0.04)",
    "--msg-ai-text": "#1a1530",
  },
}

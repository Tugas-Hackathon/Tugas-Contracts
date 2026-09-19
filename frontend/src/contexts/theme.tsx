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

/* CSS variable maps */
export const vars = {
  dark: {
    "--sb-bg": "#171717",
    "--sb-border": "rgba(255,255,255,0.08)",
    "--sb-text": "#6b7280",
    "--sb-text-bright": "#e5e7eb",
    "--sb-hover": "#2a2a2a",
    "--sb-active": "#2d2d3a",
    "--sb-active-text": "#a5b4fc",
    "--sb-input-bg": "#252525",
    "--sb-input-border": "rgba(255,255,255,0.18)",
    "--main-bg": "#1a1a1a",
    "--main-text": "#e5e7eb",
    "--main-muted": "#6b7280",
    "--card-bg": "#252525",
    "--card-border": "rgba(255,255,255,0.08)",
    "--input-bg": "#2a2a2a",
    "--input-border": "rgba(255,255,255,0.15)",
    "--msg-user-bg": "#4f46e5",
    "--msg-user-text": "#ffffff",
    "--msg-ai-bg": "#2d2d2d",
    "--msg-ai-text": "#e5e7eb",
  },
  light: {
    "--sb-bg": "#f1f3f5",
    "--sb-border": "#e2e8f0",
    "--sb-text": "#64748b",
    "--sb-text-bright": "#1e293b",
    "--sb-hover": "#e4e8ee",
    "--sb-active": "#ede9fe",
    "--sb-active-text": "#4f46e5",
    "--sb-input-bg": "#ffffff",
    "--sb-input-border": "#cbd5e1",
    "--main-bg": "#ffffff",
    "--main-text": "#111827",
    "--main-muted": "#6b7280",
    "--card-bg": "#f9fafb",
    "--card-border": "#e5e7eb",
    "--input-bg": "#ffffff",
    "--input-border": "#d1d5db",
    "--msg-user-bg": "#4f46e5",
    "--msg-user-text": "#ffffff",
    "--msg-ai-bg": "#f3f4f6",
    "--msg-ai-text": "#111827",
  },
}

import React from "react"
import ReactDOM from "react-dom/client"
import { WagmiProvider } from "wagmi"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { wagmiConfig } from "./lib/wagmi"
import { AuthContext, useAuthProvider } from "./hooks/useAuth"
import { ThemeProvider } from "./contexts/theme"
import App from "./App"
import "./index.css"

const queryClient = new QueryClient()

function AuthProvider({ children }: { children: React.ReactNode }) {
  const auth = useAuthProvider()
  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ThemeProvider>
            <App />
          </ThemeProvider>
        </AuthProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>,
)

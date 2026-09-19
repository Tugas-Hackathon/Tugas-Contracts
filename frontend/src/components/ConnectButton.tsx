import { useConnect, useDisconnect, useAccount, useChainId, useSwitchChain } from "wagmi"
import { useAuth } from "../hooks/useAuth"
import { NETWORK } from "../lib/networks"

function Btn({ onClick, compact, bg, hover, children }: {
  onClick: () => void; compact: boolean; bg: string; hover: string; children: React.ReactNode
}) {
  return (
    <button onClick={onClick}
      className={compact
        ? "w-full text-left text-xs rounded-lg px-3 py-2 transition-colors"
        : "px-4 py-2 rounded-lg text-sm font-medium transition-colors"}
      style={{ background: bg, color: "white" }}
      onMouseEnter={e => (e.currentTarget.style.background = hover)}
      onMouseLeave={e => (e.currentTarget.style.background = bg)}>
      {children}
    </button>
  )
}

export function ConnectButton({ compact = false }: { compact?: boolean }) {
  const { isConnected } = useAccount()
  const chainId = useChainId()
  const { connect, connectors } = useConnect()
  const { disconnect } = useDisconnect()
  const { authed, login, address } = useAuth()
  const { switchChain } = useSwitchChain()

  if (!isConnected)
    return (
      <Btn compact={compact} bg="#4f46e5" hover="#4338ca"
        onClick={() => connect({ connector: connectors[0] })}>
        Connect Wallet
      </Btn>
    )

  if (chainId !== NETWORK.id)
    return (
      <Btn compact={compact} bg="#d97706" hover="#b45309"
        onClick={() => switchChain({ chainId: NETWORK.id })}>
        Switch to {NETWORK.name}
      </Btn>
    )

  if (!authed)
    return (
      <Btn compact={compact} bg="#16a34a" hover="#15803d" onClick={login}>
        Sign in with wallet
      </Btn>
    )

  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs font-mono" style={{ color: "var(--sb-text)" }}>
        {address?.slice(0, 6)}…{address?.slice(-4)}
      </span>
      <button onClick={() => { disconnect(); localStorage.removeItem("tugas_token") }}
        className="text-xs px-2 py-1 rounded transition-colors"
        style={{ background: "var(--sb-hover)", color: "var(--sb-text)" }}>
        Out
      </button>
    </div>
  )
}

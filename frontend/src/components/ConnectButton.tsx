import { useConnect, useDisconnect, useAccount, useChainId, useSwitchChain } from "wagmi"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import { faRightFromBracket } from "@fortawesome/free-solid-svg-icons"
import { useAuth } from "../hooks/useAuth"
import { NETWORK } from "../lib/networks"

function Btn({ onClick, compact, bg, glow, children }: {
  onClick: () => void; compact: boolean; bg: string; glow: string; children: React.ReactNode
}) {
  return (
    <button onClick={onClick}
      className={compact
        ? "w-full text-left text-xs rounded-xl px-3 py-2.5 font-medium text-white transition-all"
        : "px-6 py-3 rounded-xl text-sm font-medium text-white transition-all"}
      style={{ background: bg, boxShadow: `0 0 22px ${glow}` }}
      onMouseEnter={e => (e.currentTarget.style.boxShadow = `0 0 34px ${glow}`)}
      onMouseLeave={e => (e.currentTarget.style.boxShadow = `0 0 22px ${glow}`)}>
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
      <Btn compact={compact} bg="linear-gradient(135deg,#8b5cf6,#6d28d9)" glow="rgba(139,92,246,0.45)"
        onClick={() => connect({ connector: connectors[0] })}>
        Connect Wallet
      </Btn>
    )

  if (chainId !== NETWORK.id)
    return (
      <Btn compact={compact} bg="linear-gradient(135deg,#f59e0b,#d97706)" glow="rgba(245,158,11,0.4)"
        onClick={() => switchChain({ chainId: NETWORK.id })}>
        Switch to {NETWORK.name}
      </Btn>
    )

  if (!authed)
    return (
      <Btn compact={compact} bg="linear-gradient(135deg,#2dd4bf,#0d9488)" glow="rgba(45,212,191,0.4)"
        onClick={login}>
        Sign in with wallet
      </Btn>
    )

  return (
    <div className="flex items-center justify-between gap-2 px-1">
      <span className="flex items-center gap-2 text-[11px] font-mono" style={{ color: "var(--text-dim)" }}>
        <span className="w-1.5 h-1.5 rounded-full shrink-0"
          style={{ background: "var(--green)", boxShadow: "0 0 7px var(--green)" }} />
        {address?.slice(0, 6)}…{address?.slice(-4)}
      </span>
      <button onClick={() => { disconnect(); localStorage.removeItem("tugas_token") }}
        className="flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-lg transition-colors"
        style={{ background: "var(--surface)", border: "1px solid var(--surface-border)", color: "var(--text-dim)" }}
        onMouseEnter={e => (e.currentTarget.style.background = "var(--surface-hover)")}
        onMouseLeave={e => (e.currentTarget.style.background = "var(--surface)")}>
        Out
        <FontAwesomeIcon icon={faRightFromBracket} className="text-[9px]" />
      </button>
    </div>
  )
}

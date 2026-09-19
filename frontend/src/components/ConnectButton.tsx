import { useConnect, useDisconnect, useAccount, useChainId, useSwitchChain } from "wagmi"
import { useAuth } from "../hooks/useAuth"
import { NETWORK } from "../lib/networks"

export function ConnectButton({ compact = false }: { compact?: boolean }) {
  const { isConnected } = useAccount()
  const chainId = useChainId()
  const { connect, connectors } = useConnect()
  const { disconnect } = useDisconnect()
  const { authed, login, address } = useAuth()
  const { switchChain } = useSwitchChain()

  const wrongNetwork = isConnected && chainId !== NETWORK.id

  if (!isConnected) {
    return compact ? (
      <button onClick={() => connect({ connector: connectors[0] })}
        className="w-full text-left text-xs rounded-lg px-3 py-2"
        style={{ background: "#4f46e5", color: "white" }}>
        Connect Wallet
      </button>
    ) : (
      <button onClick={() => connect({ connector: connectors[0] })}
        className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
        Connect Wallet
      </button>
    )
  }

  if (wrongNetwork) {
    return compact ? (
      <button onClick={() => switchChain({ chainId: NETWORK.id })}
        className="w-full text-left text-xs rounded-lg px-3 py-2"
        style={{ background: "#d97706", color: "white" }}>
        Switch to {NETWORK.name}
      </button>
    ) : (
      <button onClick={() => switchChain({ chainId: NETWORK.id })}
        className="px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600">
        Switch to {NETWORK.name}
      </button>
    )
  }

  if (!authed) {
    return compact ? (
      <button onClick={login}
        className="w-full text-left text-xs rounded-lg px-3 py-2"
        style={{ background: "#16a34a", color: "white" }}>
        Sign in with wallet
      </button>
    ) : (
      <button onClick={login}
        className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700">
        Sign in
      </button>
    )
  }

  if (compact) {
    return (
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono" style={{ color: "#9ca3af" }}>
          {address?.slice(0, 6)}…{address?.slice(-4)}
        </span>
        <button onClick={() => { disconnect(); localStorage.removeItem("tugas_token") }}
          className="text-xs px-2 py-1 rounded"
          style={{ background: "#2a2a2a", color: "#9ca3af" }}>
          Out
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-500 font-mono">
        {address?.slice(0, 6)}…{address?.slice(-4)}
      </span>
      <button onClick={() => { disconnect(); localStorage.removeItem("tugas_token") }}
        className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50">
        Disconnect
      </button>
    </div>
  )
}

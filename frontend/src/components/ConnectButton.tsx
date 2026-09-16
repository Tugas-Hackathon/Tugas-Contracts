import { useConnect, useDisconnect, useAccount, useChainId, useSwitchChain } from "wagmi"
import { useAuth } from "../hooks/useAuth"
import { NETWORK } from "../lib/networks"

export function ConnectButton() {
  const { isConnected } = useAccount()
  const chainId = useChainId()
  const { connect, connectors } = useConnect()
  const { disconnect } = useDisconnect()
  const { authed, login, address } = useAuth()
  const { switchChain } = useSwitchChain()

  const wrongNetwork = isConnected && chainId !== NETWORK.id

  if (!isConnected) {
    return (
      <button
        onClick={() => connect({ connector: connectors[0] })}
        className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
      >
        Connect Wallet
      </button>
    )
  }

  if (wrongNetwork) {
    return (
      <button
        onClick={() => switchChain({ chainId: NETWORK.id })}
        className="px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600"
      >
        Switch to {NETWORK.name}
      </button>
    )
  }

  if (!authed) {
    return (
      <button
        onClick={login}
        className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700"
      >
        Sign in
      </button>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-500 font-mono">
        {address?.slice(0, 6)}…{address?.slice(-4)}
      </span>
      <button
        onClick={() => { disconnect(); localStorage.removeItem("tugas_token") }}
        className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50"
      >
        Disconnect
      </button>
    </div>
  )
}

import { useState } from "react"
import { useWriteContract } from "wagmi"
import { api } from "../lib/api"
import { NETWORK } from "../lib/networks"

const ABI = [
  {
    name: "commit",
    type: "function",
    inputs: [
      { name: "workHash", type: "bytes32" },
      { name: "contextHash", type: "bytes32" },
      { name: "aiAssistLevel", type: "uint8" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const

const CONTRACT = import.meta.env.VITE_LEDGER_ADDRESS as `0x${string}`

type Status = "idle" | "hashing" | "awaiting_wallet" | "pending" | "confirmed" | "rejected" | "failed"

export function MilestoneCard({ milestone }: { milestone: any }) {
  const [status, setStatus] = useState<Status>("idle")
  const [draft, setDraft] = useState(milestone.draft_text ?? "")
  const [brief, setBrief] = useState("")
  const [_txHash, setTxHash] = useState<`0x${string}` | undefined>()
  const [error, setError] = useState("")

  const { writeContractAsync } = useWriteContract()

  async function commit() {
    if (!draft.trim()) return
    setError("")
    setStatus("hashing")
    try {
      const { workHash, contextHash, aiAssistLevel } = await api.hashMilestone(
        milestone.id, draft, brief, "", 60
      )
      setStatus("awaiting_wallet")
      const hash = await writeContractAsync({
        address: CONTRACT,
        abi: ABI,
        functionName: "commit",
        args: [workHash as `0x${string}`, contextHash as `0x${string}`, aiAssistLevel],
      })
      setTxHash(hash)
      setStatus("pending")
      await api.anchored(milestone.id, hash)
      setStatus("confirmed")
    } catch (e: any) {
      setError(e.message)
      setStatus(e.message?.includes("rejected") ? "rejected" : "failed")
    }
  }

  const statusColors: Record<Status, string> = {
    idle: "text-gray-400",
    hashing: "text-blue-500",
    awaiting_wallet: "text-yellow-600",
    pending: "text-yellow-600",
    confirmed: "text-green-600",
    rejected: "text-red-500",
    failed: "text-red-500",
  }

  const statusLabels: Record<Status, string> = {
    idle: "",
    hashing: "Computing hash…",
    awaiting_wallet: "Confirm in wallet…",
    pending: "Confirming on-chain…",
    confirmed: "Anchored on BOT Chain",
    rejected: "Wallet rejected",
    failed: "Failed",
  }

  return (
    <div className="rounded-xl p-4" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}>
      <div className="flex items-start justify-between mb-3">
        <span className="font-medium text-sm" style={{ color: "var(--main-text)" }}>{milestone.title}</span>
        {milestone.tx_hash && (
          <a href={`${NETWORK.explorer}/tx/${milestone.tx_hash}`} target="_blank" rel="noreferrer"
            className="text-xs text-indigo-400 hover:underline">View tx →</a>
        )}
      </div>
      <textarea value={draft} onChange={e => setDraft(e.target.value)}
        rows={3} placeholder="Paste your draft here to anchor it on-chain…"
        disabled={status !== "idle" && status !== "rejected" && status !== "failed"}
        className="w-full rounded-lg px-3 py-2 text-sm resize-none mb-2 outline-none"
        style={{ background: "var(--input-bg)", color: "var(--main-text)", border: "1px solid var(--input-border)" }} />
      <input value={brief} onChange={e => setBrief(e.target.value)}
        placeholder="Assignment brief (optional)"
        disabled={status !== "idle" && status !== "rejected" && status !== "failed"}
        className="w-full rounded-lg px-3 py-2 text-sm mb-3 outline-none"
        style={{ background: "var(--input-bg)", color: "var(--main-text)", border: "1px solid var(--input-border)" }} />
      <div className="flex items-center gap-3">
        <button onClick={commit}
          disabled={status === "hashing" || status === "awaiting_wallet" || status === "pending" || status === "confirmed"}
          className="px-4 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700 disabled:opacity-40">
          {status === "confirmed" ? "Anchored" : "Commit to chain"}
        </button>
        {status !== "idle" && (
          <span className={`text-xs ${statusColors[status]}`}>{statusLabels[status]}</span>
        )}
      </div>
      {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
    </div>
  )
}

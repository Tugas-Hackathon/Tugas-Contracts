import { useState } from "react"
import { useWriteContract } from "wagmi"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import { faArrowUpRightFromSquare } from "@fortawesome/free-solid-svg-icons"
import { api } from "../lib/api"
import { NETWORK } from "../lib/networks"
import { Pill } from "../App"

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
  const [status, setStatus] = useState<Status>(milestone.tx_hash ? "confirmed" : "idle")
  const [draft, setDraft] = useState(milestone.draft_text ?? "")
  const [brief, setBrief] = useState("")
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
      setStatus("pending")
      await api.anchored(milestone.id, hash)
      setStatus("confirmed")
    } catch (e: any) {
      setError(e.message)
      setStatus(e.message?.includes("rejected") ? "rejected" : "failed")
    }
  }

  const statusColor: Record<Status, string> = {
    idle: "var(--text-faint)",
    hashing: "var(--accent-bright)",
    awaiting_wallet: "var(--amber)",
    pending: "var(--amber)",
    confirmed: "var(--teal)",
    rejected: "var(--red)",
    failed: "var(--red)",
  }

  const statusLabel: Record<Status, string> = {
    idle: "",
    hashing: "Computing hash…",
    awaiting_wallet: "Confirm in wallet…",
    pending: "Confirming on-chain…",
    confirmed: "Anchored on BOT Chain",
    rejected: "Wallet rejected",
    failed: "Failed",
  }

  const locked = status === "hashing" || status === "awaiting_wallet" || status === "pending" || status === "confirmed"

  return (
    <div className="rounded-2xl p-5 backdrop-blur-sm"
      style={{
        background: "var(--surface)",
        border: `1px solid ${status === "confirmed" ? "var(--teal-border)" : "var(--surface-border)"}`,
      }}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="font-medium text-sm truncate" style={{ color: "var(--text)" }}>{milestone.title}</span>
          {status === "confirmed" && <Pill tone="teal">Synced</Pill>}
        </div>
        {milestone.tx_hash && (
          <a href={`${NETWORK.explorer}/tx/${milestone.tx_hash}`} target="_blank" rel="noreferrer"
            className="shrink-0 flex items-center gap-1.5 text-[11px] font-mono hover:underline"
            style={{ color: "var(--accent-bright)" }}>
            View tx
            <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="text-[8px]" />
          </a>
        )}
      </div>

      <textarea value={draft} onChange={e => setDraft(e.target.value)}
        rows={3} placeholder="Paste your draft here to anchor it on-chain…"
        disabled={locked}
        className="w-full rounded-xl px-4 py-3 text-sm resize-none mb-2.5 outline-none disabled:opacity-60"
        style={{ background: "var(--input-bg)", color: "var(--text)", border: "1px solid var(--input-border)" }} />

      <input value={brief} onChange={e => setBrief(e.target.value)}
        placeholder="Assignment brief (optional)"
        disabled={locked}
        className="w-full rounded-xl px-4 py-2.5 text-sm mb-4 outline-none disabled:opacity-60"
        style={{ background: "var(--input-bg)", color: "var(--text)", border: "1px solid var(--input-border)" }} />

      <div className="flex items-center gap-3">
        <button onClick={commit} disabled={locked}
          className="px-4 py-2 rounded-xl text-xs font-medium text-white disabled:opacity-40 transition-all"
          style={{ background: "linear-gradient(135deg,#8b5cf6,#6d28d9)", boxShadow: "0 0 16px var(--accent-glow)" }}>
          {status === "confirmed" ? "Anchored" : "Commit to chain"}
        </button>
        {status !== "idle" && (
          <span className="flex items-center gap-1.5 text-[11px] font-mono" style={{ color: statusColor[status] }}>
            <span className="w-1.5 h-1.5 rounded-full"
              style={{ background: statusColor[status], boxShadow: `0 0 7px ${statusColor[status]}` }} />
            {statusLabel[status]}
          </span>
        )}
      </div>

      {error && <p className="text-[11px] mt-3" style={{ color: "var(--red)" }}>{error}</p>}

      <div className="flex items-center justify-between mt-4 pt-3.5 text-[9px] font-mono uppercase tracking-[0.14em]"
        style={{ borderTop: "1px solid var(--surface-border)", color: "var(--text-faint)" }}>
        <span>Keccak256 · {NETWORK.name}</span>
        <span>AI Assist: 60%</span>
      </div>
    </div>
  )
}

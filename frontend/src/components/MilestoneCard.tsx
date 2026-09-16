import { useState } from "react"
import { useWriteContract, useWaitForTransactionReceipt, useChainId } from "wagmi"
import { api } from "../lib/api"
import { NETWORK, LEDGER_ADDRESS } from "../lib/networks"

// Minimal ABI: only the commit function we call + the event we read about
const LEDGER_ABI = [
  {
    name: "commit",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "workHash", type: "bytes32" },
      { name: "contextHash", type: "bytes32" },
      { name: "aiAssistLevel", type: "uint8" },
    ],
    outputs: [],
  },
] as const

type CommitState =
  | { status: "idle" }
  | { status: "hashing" }
  | { status: "awaiting_wallet" }
  | { status: "pending"; txHash: `0x${string}` }
  | { status: "confirmed"; txHash: string; explorerLink: string }
  | { status: "rejected" }
  | { status: "failed"; reason: string }

export function MilestoneCard({ milestone, onAnchored }: { milestone: any; onAnchored: () => void }) {
  const [draft, setDraft] = useState(milestone.draft_text ?? "")
  const [brief, setBrief] = useState("")
  const [rubric, setRubric] = useState("")
  const [aiLevel, setAiLevel] = useState(60)
  const [state, setState] = useState<CommitState>({ status: "idle" })
  const chainId = useChainId()

  const { writeContractAsync } = useWriteContract()
  const { data: receipt } = useWaitForTransactionReceipt({
    hash: state.status === "pending" ? state.txHash : undefined,
  })

  if (receipt && state.status === "pending") {
    const txHash = state.txHash
    const explorerLink = `${NETWORK.explorer}/tx/${txHash}`
    setState({ status: "confirmed", txHash, explorerLink })
    api.anchored(milestone.id, txHash).then(onAnchored).catch(console.error)
  }

  const wrongNetwork = chainId !== NETWORK.id
  const alreadyCommitted = !!milestone.tx_hash

  async function commit() {
    if (wrongNetwork || !draft.trim()) return
    setState({ status: "hashing" })
    try {
      const { workHash, contextHash, aiAssistLevel } = await api.hashMilestone(
        milestone.id, draft, brief, rubric, aiLevel,
      )
      setState({ status: "awaiting_wallet" })

      const txHash = await writeContractAsync({
        address: LEDGER_ADDRESS,
        abi: LEDGER_ABI,
        functionName: "commit",
        args: [workHash as `0x${string}`, contextHash as `0x${string}`, aiAssistLevel],
        chainId: NETWORK.id,
      })
      setState({ status: "pending", txHash })
    } catch (err: any) {
      if (err?.code === 4001 || err?.message?.includes("rejected") || err?.message?.includes("denied")) {
        setState({ status: "rejected" })
      } else {
        setState({ status: "failed", reason: err?.message ?? "unknown error" })
      }
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-gray-900">{milestone.title}</h3>
        {alreadyCommitted && (
          <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">Committed</span>
        )}
      </div>

      {alreadyCommitted ? (
        <a href={`${NETWORK.explorer}/tx/${milestone.tx_hash}`} target="_blank" rel="noreferrer"
          className="text-indigo-600 text-xs font-mono hover:underline break-all block">
          View on Explorer →
        </a>
      ) : (
        <>
          <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={5}
            placeholder="Write your draft here…"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-indigo-400" />

          <div className="grid grid-cols-2 gap-3">
            <input value={brief} onChange={e => setBrief(e.target.value)}
              placeholder="Assignment brief (optional)…"
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            <input value={rubric} onChange={e => setRubric(e.target.value)}
              placeholder="Rubric / marking criteria (optional)…"
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </div>

          <div className="flex items-center gap-3">
            <label className="text-xs text-gray-500 whitespace-nowrap">AI assist: {aiLevel}%</label>
            <input type="range" min={0} max={100} value={aiLevel}
              onChange={e => setAiLevel(+e.target.value)} className="flex-1" />
          </div>

          {state.status === "idle" && (
            <button onClick={commit} disabled={wrongNetwork || !draft.trim()}
              className="w-full py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-40">
              {wrongNetwork ? `Switch to ${NETWORK.name}` : "Commit to BOT Chain"}
            </button>
          )}
          {state.status === "hashing" && (
            <div className="text-center text-sm text-gray-500 py-2">Computing hash…</div>
          )}
          {state.status === "awaiting_wallet" && (
            <div className="text-center text-sm text-gray-500 py-2">Confirm in MetaMask…</div>
          )}
          {state.status === "pending" && (
            <div className="text-center text-sm text-gray-500 py-2">
              Waiting for confirmation…
              <span className="block font-mono text-xs text-gray-400 mt-1 break-all">{state.txHash}</span>
            </div>
          )}
          {state.status === "confirmed" && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm">
              <div className="text-green-700 font-medium mb-1">Committed on-chain ✓</div>
              <a href={state.explorerLink} target="_blank" rel="noreferrer"
                className="text-indigo-600 text-xs font-mono hover:underline break-all">
                {state.explorerLink} →
              </a>
            </div>
          )}
          {(state.status === "rejected" || state.status === "failed") && (
            <div className="flex items-center justify-between bg-red-50 border border-red-200 rounded-lg p-3">
              <span className="text-sm text-red-700">
                {state.status === "rejected" ? "Cancelled in wallet" : `Failed: ${state.reason}`}
              </span>
              <button onClick={() => setState({ status: "idle" })}
                className="text-xs text-red-600 hover:underline ml-3">Retry</button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

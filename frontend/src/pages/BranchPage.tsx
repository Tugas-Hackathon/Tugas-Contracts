import { useState, useEffect } from "react"
import { api } from "../lib/api"
import { MilestoneCard } from "../components/MilestoneCard"

export function BranchPage({ id, onBack }: { id: number; onBack: () => void }) {
  const [branch, setBranch] = useState<any>(null)
  const [milestones, setMilestones] = useState<any[]>([])
  const [newTitle, setNewTitle] = useState("")

  function reload() {
    api.branch(id).then(setBranch)
    api.milestones(id).then(setMilestones)
  }

  useEffect(() => { reload() }, [id])

  async function addMilestone() {
    if (!newTitle.trim()) return
    const m = await api.createMilestone(id, newTitle.trim())
    setMilestones(p => [...p, m])
    setNewTitle("")
  }

  return (
    <div>
      <button onClick={onBack} className="text-sm text-indigo-600 mb-4 hover:underline">← Back</button>
      <h2 className="text-xl font-semibold mb-1">{branch?.title ?? "…"}</h2>
      <p className="text-sm text-gray-400 mb-6 capitalize">{branch?.kind}</p>

      <div className="space-y-4">
        {milestones.map(m => (
          <MilestoneCard key={m.id} milestone={m} onAnchored={reload} />
        ))}
      </div>

      <div className="flex gap-2 mt-6">
        <input value={newTitle} onChange={e => setNewTitle(e.target.value)}
          placeholder="New milestone title…"
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
          onKeyDown={e => e.key === "Enter" && addMilestone()} />
        <button onClick={addMilestone}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
          Add
        </button>
      </div>
    </div>
  )
}

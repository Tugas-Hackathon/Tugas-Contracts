import { useState, useEffect } from "react"
import { api } from "../lib/api"
import { SubjectPage } from "./SubjectPage"

export function SubjectsPage() {
  const [subjects, setSubjects] = useState<any[]>([])
  const [selected, setSelected] = useState<number | null>(null)
  const [name, setName] = useState("")

  useEffect(() => { api.subjects().then(setSubjects) }, [])

  async function create() {
    if (!name.trim()) return
    const s = await api.createSubject(name.trim())
    setSubjects(p => [s, ...p])
    setName("")
  }

  if (selected) return <SubjectPage id={selected} onBack={() => setSelected(null)} />

  return (
    <div>
      <h2 className="text-xl font-semibold mb-6">Subjects</h2>
      <div className="flex gap-2 mb-6">
        <input value={name} onChange={e => setName(e.target.value)}
          placeholder="New subject name…"
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
          onKeyDown={e => e.key === "Enter" && create()} />
        <button onClick={create}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
          Add
        </button>
      </div>
      <div className="space-y-2">
        {subjects.map(s => (
          <button key={s.id} onClick={() => setSelected(s.id)}
            className="w-full text-left p-4 bg-white border border-gray-200 rounded-lg hover:border-indigo-300 transition-colors">
            <span className="font-medium text-gray-900">{s.name}</span>
          </button>
        ))}
        {subjects.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-8">No subjects yet. Add one above.</p>
        )}
      </div>
    </div>
  )
}

import { useState, useEffect } from "react"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import {
  faChevronDown, faChevronRight, faPlus, faCheck,
  faPaperclip, faRobot, faFileLines, faSun, faMoon,
} from "@fortawesome/free-solid-svg-icons"
import { api } from "../lib/api"
import { ConnectButton } from "./ConnectButton"
import { useTheme } from "../contexts/theme"
import type { View } from "../App"

interface Props {
  view: View
  onNavigate: (v: View) => void
}

export function Sidebar({ view, onNavigate }: Props) {
  const { theme, toggle } = useTheme()
  const [subjects, setSubjects] = useState<any[]>([])
  const [branches, setBranches] = useState<Record<number, any[]>>({})
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [newSubject, setNewSubject] = useState("")
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState("")

  useEffect(() => {
    api.subjects().then(setSubjects).catch(() => {})
  }, [])

  function toggleSubject(id: number) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
        if (!branches[id]) {
          api.branches(id).then(b => setBranches(p => ({ ...p, [id]: b })))
        }
      }
      return next
    })
  }

  async function addSubject() {
    const name = newSubject.trim()
    if (!name) { setAddError("Type a name first"); return }
    setAddError("")
    try {
      const s = await api.createSubject(name)
      setSubjects(p => [...p, s])
      setNewSubject("")
      setAdding(false)
    } catch (e: any) {
      setAddError(e.message ?? "Failed")
    }
  }

  async function addBranch(subjectId: number, title: string) {
    const b = await api.createBranch(subjectId, { kind: "assignment", title })
    setBranches(p => ({ ...p, [subjectId]: [...(p[subjectId] ?? []), b] }))
  }

  const isActive = (v: View) => JSON.stringify(v) === JSON.stringify(view)

  return (
    <aside className="flex flex-col h-screen w-64 shrink-0 select-none"
      style={{ background: "var(--sb-bg)", borderRight: "1px solid var(--sb-border)" }}>

      {/* Logo */}
      <div className="px-4 pt-5 pb-3 flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-indigo-500 flex items-center justify-center shrink-0">
          <span className="text-white text-xs font-bold">T</span>
        </div>
        <span className="font-semibold text-sm tracking-wide" style={{ color: "var(--sb-text-bright)" }}>Tugas</span>
      </div>

      {/* New subject input */}
      <div className="px-3 mb-3">
        {adding ? (
          <div>
            <div className="flex gap-1">
              <input autoFocus value={newSubject}
                onChange={e => { setNewSubject(e.target.value); setAddError("") }}
                onKeyDown={e => {
                  if (e.key === "Enter") addSubject()
                  if (e.key === "Escape") { setAdding(false); setAddError(""); setNewSubject("") }
                }}
                placeholder="e.g. Database Systems"
                className="flex-1 text-xs rounded-md px-2 py-1.5 outline-none"
                style={{ background: "var(--sb-input-bg)", color: "var(--sb-text-bright)", border: "1px solid var(--sb-input-border)" }} />
              <button onClick={addSubject}
                className="text-xs px-3 py-1 rounded-md text-white font-semibold"
                style={{ background: "#4f46e5" }}>Add</button>
            </div>
            {addError && <p className="text-xs mt-1 px-1" style={{ color: "#f87171" }}>{addError}</p>}
          </div>
        ) : (
          <button onClick={() => setAdding(true)}
            className="w-full flex items-center gap-2 text-xs rounded-md px-3 py-2 transition-colors"
            style={{ color: "var(--sb-text)" }}
            onMouseEnter={e => (e.currentTarget.style.background = "var(--sb-hover)")}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
            <FontAwesomeIcon icon={faPlus} className="w-3 h-3" />
            <span>New subject</span>
          </button>
        )}
      </div>

      <div className="px-4 mb-1">
        <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--sb-text)", opacity: 0.5 }}>Subjects</span>
      </div>

      {/* Subject list */}
      <nav className="flex-1 overflow-y-auto px-2 space-y-0.5 pb-4">
        {subjects.map(s => {
          const open = expanded.has(s.id)
          return (
            <div key={s.id}>
              <button onClick={() => toggleSubject(s.id)}
                className="w-full flex items-center gap-2 rounded-lg px-2 py-2 text-left text-xs transition-colors"
                style={{ color: open ? "var(--sb-text-bright)" : "var(--sb-text)" }}
                onMouseEnter={e => (e.currentTarget.style.background = "var(--sb-hover)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                <FontAwesomeIcon icon={open ? faChevronDown : faChevronRight}
                  className="w-2.5 h-2.5 shrink-0" style={{ color: "var(--sb-text)" }} />
                <span className="truncate flex-1 font-medium">{s.name}</span>
              </button>

              {open && (
                <div className="ml-5 mt-0.5 space-y-0.5">
                  <SidebarItem label="Materials" icon={<FontAwesomeIcon icon={faPaperclip} className="w-3 h-3" />}
                    active={isActive({ type: "materials", subjectId: s.id })}
                    onClick={() => onNavigate({ type: "materials", subjectId: s.id })} />
                  <SidebarItem label="AI Tutor" icon={<FontAwesomeIcon icon={faRobot} className="w-3 h-3" />}
                    active={isActive({ type: "tutor", subjectId: s.id })}
                    onClick={() => onNavigate({ type: "tutor", subjectId: s.id })} />
                  {(branches[s.id] ?? []).map((b: any) => (
                    <SidebarItem key={b.id} label={b.title}
                      icon={<FontAwesomeIcon icon={faFileLines} className="w-3 h-3" />}
                      active={isActive({ type: "branch", branchId: b.id, subjectId: s.id })}
                      onClick={() => onNavigate({ type: "branch", branchId: b.id, subjectId: s.id })} />
                  ))}
                  <AddBranchInline onAdd={title => addBranch(s.id, title)} />
                </div>
              )}
            </div>
          )
        })}
        {subjects.length === 0 && (
          <p className="text-xs px-3 py-4" style={{ color: "var(--sb-text)", opacity: 0.4 }}>No subjects yet.</p>
        )}
      </nav>

      {/* Bottom: theme toggle + wallet */}
      <div className="px-3 py-3 space-y-2" style={{ borderTop: "1px solid var(--sb-border)" }}>
        <button onClick={toggle}
          className="w-full flex items-center gap-2 rounded-md px-3 py-2 text-xs transition-colors"
          style={{ background: "var(--sb-hover)", color: "var(--sb-text)" }}>
          <FontAwesomeIcon icon={theme === "dark" ? faSun : faMoon} className="w-3 h-3" />
          <span>{theme === "dark" ? "Light mode" : "Dark mode"}</span>
        </button>
        <ConnectButton compact />
      </div>
    </aside>
  )
}

function SidebarItem({ label, icon, active, onClick }: {
  label: string; icon: React.ReactNode; active: boolean; onClick: () => void
}) {
  return (
    <button onClick={onClick}
      className="w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors"
      style={{
        background: active ? "var(--sb-active)" : "transparent",
        color: active ? "var(--sb-active-text)" : "var(--sb-text)",
        border: active ? "1px solid rgba(99,102,241,0.2)" : "1px solid transparent",
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = "var(--sb-hover)" }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = "transparent" }}>
      <span className="shrink-0 w-3 flex justify-center">{icon}</span>
      <span className="truncate">{label}</span>
    </button>
  )
}

function AddBranchInline({ onAdd }: { onAdd: (title: string) => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState("")

  async function submit() {
    if (!title.trim()) return
    await onAdd(title.trim())
    setTitle("")
    setOpen(false)
  }

  if (!open)
    return (
      <button onClick={() => setOpen(true)}
        className="w-full flex items-center gap-1.5 rounded-md px-2 py-1 text-xs"
        style={{ color: "var(--sb-text)", opacity: 0.5 }}
        onMouseEnter={e => (e.currentTarget.style.opacity = "1")}
        onMouseLeave={e => (e.currentTarget.style.opacity = "0.5")}>
        <FontAwesomeIcon icon={faPlus} className="w-2.5 h-2.5" />
        <span>Add assignment</span>
      </button>
    )

  return (
    <div className="flex gap-1 pr-1">
      <input autoFocus value={title} onChange={e => setTitle(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") submit(); if (e.key === "Escape") setOpen(false) }}
        placeholder="Assignment name…"
        className="flex-1 text-xs rounded px-1.5 py-1 outline-none"
        style={{ background: "var(--sb-input-bg)", color: "var(--sb-text-bright)", border: "1px solid var(--sb-input-border)" }} />
      <button onClick={submit} className="text-xs px-1.5 rounded flex items-center"
        style={{ background: "#4f46e5", color: "white" }}>
        <FontAwesomeIcon icon={faCheck} className="w-3 h-3" />
      </button>
    </div>
  )
}

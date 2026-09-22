import { useState, useEffect, useRef } from "react"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import {
  faChevronDown, faChevronRight, faPlus, faCheck,
  faPaperclip, faRobot, faFileLines, faSun, faMoon,
  faMagnifyingGlass, faXmark, faTrash,
} from "@fortawesome/free-solid-svg-icons"
import { faWhatsapp } from "@fortawesome/free-brands-svg-icons"
import { api } from "../lib/api"
import { ConnectButton } from "./ConnectButton"
import { useTheme } from "../contexts/theme"
import { Kbd, Pill } from "../App"
import type { View } from "../App"

interface Props {
  view: View
  onNavigate: (v: View) => void
  onCrumb: (c: string) => void
}

export function Sidebar({ view, onNavigate, onCrumb }: Props) {
  const { theme, toggle } = useTheme()
  const [subjects, setSubjects] = useState<any[]>([])
  const [branches, setBranches] = useState<Record<number, any[]>>({})
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [newSubject, setNewSubject] = useState("")
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState("")
  const [query, setQuery] = useState("")
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    api.subjects().then(setSubjects).catch(() => {})
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const q = query.trim().toLowerCase()
  const visible = q
    ? subjects.filter(s =>
        s.name.toLowerCase().includes(q) ||
        (branches[s.id] ?? []).some((b: any) => b.title.toLowerCase().includes(q))
      )
    : subjects

  function go(v: View, crumb: string) {
    onNavigate(v)
    onCrumb(crumb)
  }

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

  async function addBranch(subjectId: number, title: string, kind: string) {
    const b = await api.createBranch(subjectId, { kind, title })
    setBranches(p => ({ ...p, [subjectId]: [...(p[subjectId] ?? []), b] }))
  }

  async function removeBranch(subjectId: number, branch: any) {
    if (!confirm(`Delete "${branch.title}" and its milestones?\n\nAnything already anchored stays on BOT Chain — that record cannot be removed.`)) return
    try {
      await api.deleteBranch(branch.id)
      setBranches(p => ({ ...p, [subjectId]: (p[subjectId] ?? []).filter((b: any) => b.id !== branch.id) }))
      // Don't leave the user staring at a branch that no longer exists.
      if (view.type === "branch" && view.branchId === branch.id) go({ type: "home" }, "Workspace")
    } catch (e: any) {
      alert(e.message)
    }
  }

  const isActive = (v: View) => JSON.stringify(v) === JSON.stringify(view)

  return (
    <aside className="relative flex flex-col w-64 shrink-0 select-none rounded-2xl overflow-hidden backdrop-blur-xl"
      style={{ background: "var(--panel)", border: "1px solid var(--panel-border)" }}>

      {/* Brand */}
      <div className="px-4 pt-4 pb-3 flex items-center gap-3"
        style={{ borderBottom: "1px solid var(--panel-border)" }}>
        <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
          style={{
            background: "linear-gradient(135deg,#8b5cf6,#6d28d9)",
            boxShadow: "0 0 18px var(--accent-glow)",
          }}>
          <span className="text-white text-sm font-bold">T</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold leading-tight" style={{ color: "var(--text)" }}>Tugas</div>
          <div className="text-[9px] font-mono uppercase tracking-[0.18em] leading-tight" style={{ color: "var(--text-faint)" }}>
            Smart Glass OS
          </div>
        </div>
        <Pill tone="dim">v2.4</Pill>
      </div>

      {/* Search */}
      <div className="px-3 pt-3">
        <div className="flex items-center gap-2 rounded-xl px-3 py-2 transition-colors"
          style={{ background: "var(--input-bg)", border: "1px solid var(--input-border)" }}>
          <FontAwesomeIcon icon={faMagnifyingGlass} className="text-[10px] shrink-0"
            style={{ color: "var(--text-faint)" }} />
          <input ref={searchRef} value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === "Escape" && setQuery("")}
            placeholder="Search subjects…"
            className="flex-1 min-w-0 bg-transparent text-xs outline-none"
            style={{ color: "var(--text)" }} />
          {query
            ? <button onClick={() => setQuery("")} className="shrink-0" style={{ color: "var(--text-faint)" }}>
                <FontAwesomeIcon icon={faXmark} className="text-[10px]" />
              </button>
            : <Kbd>⌘K</Kbd>}
        </div>
      </div>

      {/* New subject */}
      <div className="px-3 pt-2 pb-2">
        {adding ? (
          <div>
            <div className="flex gap-1.5">
              <input autoFocus value={newSubject}
                onChange={e => { setNewSubject(e.target.value); setAddError("") }}
                onKeyDown={e => {
                  if (e.key === "Enter") addSubject()
                  if (e.key === "Escape") { setAdding(false); setAddError(""); setNewSubject("") }
                }}
                placeholder="e.g. Database Systems"
                className="flex-1 text-xs rounded-lg px-2.5 py-2 outline-none"
                style={{ background: "var(--input-bg)", color: "var(--text)", border: "1px solid var(--input-border)" }} />
              <button onClick={addSubject} className="text-xs px-3 rounded-lg font-semibold text-white"
                style={{ background: "var(--accent)" }}>Add</button>
            </div>
            {addError && <p className="text-[11px] mt-1.5 px-1" style={{ color: "var(--red)" }}>{addError}</p>}
          </div>
        ) : (
          <button onClick={() => setAdding(true)}
            className="w-full flex items-center gap-2 text-xs rounded-xl px-3 py-2.5 transition-colors"
            style={{ background: "var(--surface)", border: "1px solid var(--surface-border)", color: "var(--text-dim)" }}
            onMouseEnter={e => (e.currentTarget.style.background = "var(--surface-hover)")}
            onMouseLeave={e => (e.currentTarget.style.background = "var(--surface)")}>
            <FontAwesomeIcon icon={faPlus} className="text-[10px]" />
            <span className="flex-1 text-left">New subject</span>
            <Kbd>⌘N</Kbd>
          </button>
        )}
      </div>

      {/* Section label */}
      <div className="px-4 pt-2 pb-1.5 flex items-center justify-between">
        <span className="text-[10px] font-mono font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--text-faint)" }}>
          Subjects
        </span>
        <span className="text-[10px] font-mono" style={{ color: "var(--text-faint)" }}>
          {q ? `${visible.length} found` : `${subjects.length} active`}
        </span>
      </div>

      {/* Subject tree */}
      <nav className="flex-1 overflow-y-auto px-2 pb-3 space-y-0.5">
        {visible.map(s => {
          const open = expanded.has(s.id)
          return (
            <div key={s.id}>
              <button onClick={() => toggleSubject(s.id)}
                className="w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors"
                style={{ color: open ? "var(--text)" : "var(--text-dim)" }}
                onMouseEnter={e => (e.currentTarget.style.background = "var(--surface-hover)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                <FontAwesomeIcon icon={open ? faChevronDown : faChevronRight}
                  className="text-[9px] shrink-0" style={{ color: "var(--text-faint)" }} />
                <span className="truncate flex-1 font-medium">{s.name}</span>
                {open && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "var(--teal)" }} />}
              </button>

              {open && (
                <div className="ml-4 mt-0.5 space-y-0.5">
                  <Item label="Materials" icon={faPaperclip}
                    active={isActive({ type: "materials", subjectId: s.id })}
                    onClick={() => go({ type: "materials", subjectId: s.id }, `${s.name} / Materials`)} />
                  <Item label="AI Tutor" icon={faRobot} badge="Ready"
                    active={isActive({ type: "tutor", subjectId: s.id })}
                    onClick={() => go({ type: "tutor", subjectId: s.id }, `${s.name} / AI Tutor`)} />
                  {(branches[s.id] ?? []).map((b: any) => (
                    <Item key={b.id} label={b.title} icon={faFileLines}
                      active={isActive({ type: "branch", branchId: b.id, subjectId: s.id })}
                      onClick={() => go({ type: "branch", branchId: b.id, subjectId: s.id }, `${s.name} / ${b.title}`)}
                      onDelete={() => removeBranch(s.id, b)} />
                  ))}
                  <AddBranchInline onAdd={(title, kind) => addBranch(s.id, title, kind)} />
                </div>
              )}
            </div>
          )
        })}
        {visible.length === 0 && (
          <p className="text-xs px-3 py-5" style={{ color: "var(--text-faint)" }}>
            {q ? `No subjects match "${query.trim()}".` : "No subjects yet."}
          </p>
        )}
      </nav>

      {/* Footer */}
      <div className="px-3 py-3 space-y-2" style={{ borderTop: "1px solid var(--panel-border)" }}>
        <button onClick={() => go({ type: "whatsapp" }, "WhatsApp")}
          className="w-full flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs transition-colors"
          style={{
            background: isActive({ type: "whatsapp" }) ? "var(--teal-soft)" : "var(--surface)",
            border: `1px solid ${isActive({ type: "whatsapp" }) ? "var(--teal-border)" : "var(--surface-border)"}`,
            color: isActive({ type: "whatsapp" }) ? "var(--teal)" : "var(--text-dim)",
          }}>
          <FontAwesomeIcon icon={faWhatsapp} className="text-[11px]" style={{ color: "var(--teal)" }} />
          <span className="flex-1 text-left">WhatsApp</span>
        </button>
        <button onClick={toggle}
          className="w-full flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs transition-colors"
          style={{ background: "var(--surface)", border: "1px solid var(--surface-border)", color: "var(--text-dim)" }}
          onMouseEnter={e => (e.currentTarget.style.background = "var(--surface-hover)")}
          onMouseLeave={e => (e.currentTarget.style.background = "var(--surface)")}>
          <FontAwesomeIcon icon={theme === "dark" ? faSun : faMoon}
            className="text-[10px]" style={{ color: "var(--amber)" }} />
          <span className="flex-1 text-left">{theme === "dark" ? "Light mode" : "Dark mode"}</span>
          <Kbd>⌘L</Kbd>
        </button>
        <ConnectButton compact />
      </div>
    </aside>
  )
}

function Item({ label, icon, badge, active, onClick, onDelete }: {
  label: string
  icon: typeof faPaperclip
  badge?: string
  active: boolean
  onClick: () => void
  onDelete?: () => void
}) {
  return (
    <div className="group relative flex items-center rounded-lg transition-all"
      style={{
        background: active ? "var(--accent-soft)" : "transparent",
        border: `1px solid ${active ? "var(--accent-border)" : "transparent"}`,
        boxShadow: active ? "0 0 14px var(--accent-soft)" : "none",
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = "var(--surface-hover)" }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = "transparent" }}>
      <button onClick={onClick}
        className="flex-1 min-w-0 flex items-center gap-2 px-2.5 py-2 text-left text-xs"
        style={{ color: active ? "var(--accent-bright)" : "var(--text-dim)" }}>
        <FontAwesomeIcon icon={icon} className="text-[10px] shrink-0 w-3" />
        <span className="truncate flex-1">{label}</span>
        {badge && active && <Pill tone="accent">{badge}</Pill>}
      </button>
      {onDelete && (
        <button onClick={e => { e.stopPropagation(); onDelete() }}
          title="Delete assignment"
          className="opacity-0 group-hover:opacity-100 transition-opacity px-2 py-2 shrink-0"
          style={{ color: "var(--text-faint)" }}
          onMouseEnter={e => (e.currentTarget.style.color = "var(--red)")}
          onMouseLeave={e => (e.currentTarget.style.color = "var(--text-faint)")}>
          <FontAwesomeIcon icon={faTrash} className="text-[10px]" />
        </button>
      )}
    </div>
  )
}

function AddBranchInline({ onAdd }: { onAdd: (title: string, kind: string) => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState("")
  const [kind, setKind] = useState("assignment")

  async function submit() {
    if (!title.trim()) return
    await onAdd(title.trim(), kind)
    setTitle("")
    setOpen(false)
  }

  if (!open)
    return (
      <button onClick={() => setOpen(true)}
        className="w-full flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs transition-opacity"
        style={{ color: "var(--text-faint)" }}
        onMouseEnter={e => (e.currentTarget.style.color = "var(--text-dim)")}
        onMouseLeave={e => (e.currentTarget.style.color = "var(--text-faint)")}>
        <FontAwesomeIcon icon={faPlus} className="text-[9px] w-3" />
        <span>Add assignment or exam</span>
      </button>
    )

  return (
    <div className="pr-1 space-y-1.5">
      <div className="flex gap-1">
        {["assignment", "exam"].map(k => (
          <button key={k} onClick={() => setKind(k)}
            className="flex-1 text-[10px] py-1 rounded-md capitalize transition-colors"
            style={{
              background: kind === k ? "var(--accent-soft)" : "var(--surface)",
              border: `1px solid ${kind === k ? "var(--accent-border)" : "var(--surface-border)"}`,
              color: kind === k ? "var(--accent-bright)" : "var(--text-faint)",
            }}>
            {k}
          </button>
        ))}
      </div>
      <div className="flex gap-1.5">
        <input autoFocus value={title} onChange={e => setTitle(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") submit(); if (e.key === "Escape") setOpen(false) }}
          placeholder={kind === "exam" ? "Exam name…" : "Assignment name…"}
          className="flex-1 min-w-0 text-xs rounded-lg px-2 py-1.5 outline-none"
          style={{ background: "var(--input-bg)", color: "var(--text)", border: "1px solid var(--input-border)" }} />
        <button onClick={submit} className="text-xs px-2 rounded-lg flex items-center text-white shrink-0"
          style={{ background: "var(--accent)" }}>
          <FontAwesomeIcon icon={faCheck} className="text-[10px]" />
        </button>
      </div>
    </div>
  )
}

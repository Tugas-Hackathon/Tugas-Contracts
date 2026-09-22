const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000"

function token() {
  return localStorage.getItem("tugas_token") ?? ""
}

async function req(method: string, path: string, body?: unknown) {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token()}`,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!r.ok) throw new Error(await errorText(r))
  if (r.status === 204) return null
  return r.json()
}

// FastAPI wraps errors as {"detail": ...}, and a proxied sidecar error arrives
// as JSON nested inside that detail string — so unwrap repeatedly.
async function errorText(r: Response) {
  let text = await r.text()
  for (let i = 0; i < 3; i++) {
    try {
      const parsed = JSON.parse(text)
      const inner = parsed?.detail ?? parsed?.error ?? parsed?.message
      if (typeof inner !== "string") break
      text = inner
    } catch { break }
  }
  return text || `Request failed (${r.status})`
}

async function blobUrl(mid: number) {
  const r = await fetch(`${BASE}/materials/${mid}/download`, {
    headers: { Authorization: `Bearer ${token()}` },
  })
  if (!r.ok) throw new Error(await errorText(r))
  return URL.createObjectURL(await r.blob())
}

export const api = {
  nonce: (address: string) => req("GET", `/auth/nonce?address=${address}`),
  verify: (address: string, signature: string) =>
    req("POST", "/auth/verify", { address, signature }),

  subjects: () => req("GET", "/subjects"),
  createSubject: (name: string) => req("POST", "/subjects", { name }),

  materials: (sid: number) => req("GET", `/subjects/${sid}/materials`),
  deleteMaterial: (mid: number) => req("DELETE", `/materials/${mid}`),
  downloadMaterial: async (mid: number, filename: string) => {
    const url = await blobUrl(mid)
    const a = document.createElement("a")
    a.href = url; a.download = filename; a.click()
    URL.revokeObjectURL(url)
  },
  previewMaterial: async (mid: number) => window.open(await blobUrl(mid), "_blank"),
  uploadMaterial: async (sid: number, file: File) => {
    const fd = new FormData()
    fd.append("file", file)
    const r = await fetch(`${BASE}/subjects/${sid}/materials`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token()}` },
      body: fd,
    })
    if (!r.ok) throw new Error(await errorText(r))
    return r.json()
  },

  branches: (sid: number) => req("GET", `/subjects/${sid}/branches`),
  createBranch: (sid: number, data: { kind: string; title: string; due_at?: number }) =>
    req("POST", `/subjects/${sid}/branches`, data),
  branch: (id: number) => req("GET", `/branches/${id}`),
  deleteBranch: (id: number) => req("DELETE", `/branches/${id}`),
  outline: (bid: number, brief: string) =>
    req("POST", `/branches/${bid}/outline`, { brief }),
  planBranch: (bid: number, brief: string) =>
    req("POST", `/branches/${bid}/plan`, { brief }),
  planBranchFile: async (bid: number, file: File) => {
    const fd = new FormData()
    fd.append("file", file)
    const r = await fetch(`${BASE}/branches/${bid}/plan-file`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token()}` },
      body: fd,
    })
    if (!r.ok) throw new Error(await errorText(r))
    return r.json()
  },
  rubricCheck: (bid: number, draft: string) =>
    req("POST", `/branches/${bid}/rubric-check`, { draft }),

  agenda: () => req("GET", "/agenda"),
  createEvent: (body: { title: string; starts_at: number; ends_at?: number | null; kind?: string }) =>
    req("POST", "/events", body),
  deleteEvent: (id: number) => req("DELETE", `/events/${id}`),
  setBranchDue: (bid: number, due_at: number | null) =>
    req("PUT", `/branches/${bid}/due`, { due_at }),
  downloadIcs: async (ident: string) => {
    const r = await fetch(`${BASE}/agenda/${ident}.ics`, {
      headers: { Authorization: `Bearer ${token()}` },
    })
    if (!r.ok) throw new Error(await errorText(r))
    const url = URL.createObjectURL(await r.blob())
    const a = document.createElement("a")
    a.href = url; a.download = `${ident}.ics`; a.click()
    URL.revokeObjectURL(url)
  },

  quiz: (bid: number) => req("GET", `/branches/${bid}/quiz`),
  makeQuiz: (bid: number, paper: string) => req("POST", `/branches/${bid}/quiz`, { paper }),
  makeQuizFile: async (bid: number, file: File) => {
    const fd = new FormData()
    fd.append("file", file)
    const r = await fetch(`${BASE}/branches/${bid}/quiz-file`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token()}` },
      body: fd,
    })
    if (!r.ok) throw new Error(await errorText(r))
    return r.json()
  },
  submitQuiz: (bid: number, answers: number[]) =>
    req("POST", `/branches/${bid}/quiz/attempt`, { answers }),

  milestones: (bid: number) => req("GET", `/branches/${bid}/milestones`),
  createMilestone: (bid: number, title: string) =>
    req("POST", `/branches/${bid}/milestones`, { title }),
  hashMilestone: (
    mid: number,
    draft: string,
    brief: string,
    rubric: string,
    ai_assist_level: number,
  ) => req("POST", `/milestones/${mid}/hash`, { draft, brief, rubric, ai_assist_level }),
  anchored: (mid: number, tx_hash: string) =>
    req("POST", `/milestones/${mid}/anchored`, { tx_hash }),

  ask: (sid: number, question: string) =>
    req("POST", `/subjects/${sid}/ask`, { question }),

  waStart: () => req("POST", "/whatsapp/session"),
  waStatus: () => req("GET", "/whatsapp/session"),
  waGroups: () => req("GET", "/whatsapp/groups"),
  waSenders: (chatId: string) => req("GET", `/whatsapp/senders?chat_id=${encodeURIComponent(chatId)}`),
  waLogout: () => req("DELETE", "/whatsapp/session"),
  waLinks: () => req("GET", "/whatsapp/links"),
  waSetLink: (subjectId: number, body: {
    chat_id: string; chat_name: string
    focus_sender?: string | null; focus_sender_name?: string | null
  }) => req("PUT", `/whatsapp/links/${subjectId}`, body),
  waClearLink: (subjectId: number) => req("DELETE", `/whatsapp/links/${subjectId}`),
  waSync: () => req("POST", "/whatsapp/sync"),
  waContext: (subjectId: number) => req("GET", `/whatsapp/context/${subjectId}`),
}

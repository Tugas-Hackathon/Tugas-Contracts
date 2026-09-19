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
  if (!r.ok) throw new Error(await r.text())
  if (r.status === 204) return null
  return r.json()
}

async function blobUrl(mid: number) {
  const r = await fetch(`${BASE}/materials/${mid}/download`, {
    headers: { Authorization: `Bearer ${token()}` },
  })
  if (!r.ok) throw new Error(await r.text())
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
    if (!r.ok) throw new Error(await r.text())
    return r.json()
  },

  branches: (sid: number) => req("GET", `/subjects/${sid}/branches`),
  createBranch: (sid: number, data: { kind: string; title: string; due_at?: number }) =>
    req("POST", `/subjects/${sid}/branches`, data),
  branch: (id: number) => req("GET", `/branches/${id}`),
  outline: (bid: number, brief: string) =>
    req("POST", `/branches/${bid}/outline`, { brief }),
  rubricCheck: (bid: number, draft: string) =>
    req("POST", `/branches/${bid}/rubric-check`, { draft }),

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
}

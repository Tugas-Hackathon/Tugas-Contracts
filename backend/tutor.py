import os
from pathlib import Path
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from db import get_db
from auth import current_user
from llm import parse, LLMDeclined

router = APIRouter()

CHUNK_WORDS = 300  # ponytail: flat chunking; add overlap/retrieval if subject > model context


class AskBody(BaseModel):
    question: str


class Citation(BaseModel):
    chunk_id: str
    quote: str


class TutorResponse(BaseModel):
    answer: str
    citations: list[Citation]


def _chunk_text(material_id: int, text: str) -> list[tuple[str, str]]:
    words = text.split()
    chunks = []
    page = 1
    for i in range(0, max(len(words), 1), CHUNK_WORDS):
        chunk = " ".join(words[i : i + CHUNK_WORDS])
        if chunk:
            chunks.append((f"M{material_id}p{page}", chunk))
            page += 1
    return chunks


@router.post("/subjects/{subject_id}/ask")
def ask(subject_id: int, body: AskBody, user: str = Depends(current_user)):
    with get_db() as db:
        sub = db.execute(
            "SELECT id FROM subjects WHERE id=? AND user_id=?", (subject_id, user)
        ).fetchone()
        if not sub:
            raise HTTPException(404, "subject not found")

        materials = db.execute(
            "SELECT id, filename, text FROM materials "
            "WHERE subject_id=? AND user_id=? AND text IS NOT NULL",
            (subject_id, user),
        ).fetchall()

    if not materials:
        raise HTTPException(422, "no materials uploaded yet — add notes first")

    chunks: list[tuple[str, str]] = []
    meta: dict[str, dict] = {}
    for mat in materials:
        mat_chunks = _chunk_text(mat["id"], mat["text"] or "")
        for cid, text in mat_chunks:
            chunks.append((cid, text))
            page_num = int(cid.split("p")[-1])
            meta[cid] = {"filename": mat["filename"], "page": page_num}

    valid_ids = {cid for cid, _ in chunks}
    context = "\n\n---\n\n".join(f"[{cid}]\n{text}" for cid, text in chunks)

    wa_path = Path(os.getenv("DATA_DIR", "./data")) / "context" / user / f"subject-{subject_id}.md"
    wa_note = ""
    if wa_path.exists():
        wa = wa_path.read_text(encoding="utf-8").strip()
        if wa:
            wa_note = (
                "\n\nCLASS GROUP NOTES (context only — never cite these, they have no chunk ID):\n"
                f"{wa}"
            )

    prompt = (
        "You are a study assistant. Answer ONLY using the provided study materials below.\n"
        "For every claim, cite the chunk ID (e.g. M1p2) and an exact short quote.\n"
        "If the answer is not in the materials, say so.\n\n"
        f"MATERIALS:\n{context}"
        f"{wa_note}\n\n"
        f"QUESTION: {body.question}"
    )

    try:
        result = parse("tutor", prompt, TutorResponse)
    except LLMDeclined as e:
        raise HTTPException(502, str(e))

    valid_citations = [
        {"chunk_id": c.chunk_id, "quote": c.quote, **meta.get(c.chunk_id, {})}
        for c in result.citations
        if c.chunk_id in valid_ids
    ]

    return {"answer": result.answer, "citations": valid_citations}

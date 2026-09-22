import tempfile
from pathlib import Path
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from pydantic import BaseModel
from typing import Optional
from db import get_db
from auth import current_user
from llm import parse, LLMDeclined
from materials import _extract_text

PLAN_EXTS = {".pdf", ".docx", ".txt", ".md"}
MAX_BRIEF_BYTES = 10 * 1024 * 1024

router = APIRouter()


class BranchIn(BaseModel):
    kind: str
    title: str
    due_at: Optional[int] = None
    targeted_topics: Optional[str] = None


class OutlineSection(BaseModel):
    title: str
    points: list[str]


class OutlineResult(BaseModel):
    sections: list[OutlineSection]


class RubricCriterion(BaseModel):
    name: str
    met: bool
    evidence: str
    suggestion: str


class RubricResult(BaseModel):
    criteria: list[RubricCriterion]


class OutlineBody(BaseModel):
    brief: str


class RubricBody(BaseModel):
    draft: str


def _row(r) -> dict:
    return {k: r[k] for k in r.keys()}


@router.post("/subjects/{subject_id}/branches", status_code=201)
def create_branch(subject_id: int, body: BranchIn, user: str = Depends(current_user)):
    if body.kind not in ("assignment", "exam", "project"):
        raise HTTPException(422, "kind must be assignment, exam, or project")
    with get_db() as db:
        sub = db.execute("SELECT id FROM subjects WHERE id=? AND user_id=?",
                         (subject_id, user)).fetchone()
        if not sub:
            raise HTTPException(404, "subject not found")
        cur = db.execute(
            "INSERT INTO branches(subject_id,user_id,kind,title,due_at,targeted_topics) "
            "VALUES(?,?,?,?,?,?) RETURNING id,subject_id,kind,title,due_at,created_at",
            (subject_id, user, body.kind, body.title, body.due_at, body.targeted_topics),
        )
        return _row(cur.fetchone())


@router.get("/subjects/{subject_id}/branches")
def list_branches(subject_id: int, user: str = Depends(current_user)):
    with get_db() as db:
        sub = db.execute("SELECT id FROM subjects WHERE id=? AND user_id=?",
                         (subject_id, user)).fetchone()
        if not sub:
            raise HTTPException(404, "subject not found")
        rows = db.execute(
            "SELECT id,subject_id,kind,title,due_at,created_at FROM branches "
            "WHERE subject_id=? AND user_id=? ORDER BY created_at DESC",
            (subject_id, user),
        ).fetchall()
    return [_row(r) for r in rows]


@router.get("/branches/{branch_id}")
def get_branch(branch_id: int, user: str = Depends(current_user)):
    with get_db() as db:
        row = db.execute(
            "SELECT id,subject_id,kind,title,due_at,created_at FROM branches "
            "WHERE id=? AND user_id=?", (branch_id, user)
        ).fetchone()
    if not row:
        raise HTTPException(404, "not found")
    return _row(row)


@router.post("/branches/{branch_id}/outline")
def outline(branch_id: int, body: OutlineBody, user: str = Depends(current_user)):
    with get_db() as db:
        row = db.execute("SELECT title FROM branches WHERE id=? AND user_id=?",
                         (branch_id, user)).fetchone()
    if not row:
        raise HTTPException(404, "branch not found")
    prompt = (
        f"Assignment title: {row['title']}\nBrief: {body.brief}\n\n"
        "Generate a structured outline with sections and key points."
    )
    try:
        return parse("outline", prompt, OutlineResult, user=user).model_dump()
    except LLMDeclined as e:
        raise HTTPException(502, str(e))


@router.post("/branches/{branch_id}/rubric-check")
def rubric_check(branch_id: int, body: RubricBody, user: str = Depends(current_user)):
    with get_db() as db:
        row = db.execute("SELECT title FROM branches WHERE id=? AND user_id=?",
                         (branch_id, user)).fetchone()
    if not row:
        raise HTTPException(404, "branch not found")
    prompt = (
        f"Assignment: {row['title']}\n\nStudent draft:\n{body.draft}\n\n"
        "Evaluate this draft against standard academic rubric criteria. "
        "For each criterion state if met, provide evidence, and a suggestion if not met."
    )
    try:
        return parse("rubric", prompt, RubricResult, user=user).model_dump()
    except LLMDeclined as e:
        raise HTTPException(502, str(e))


@router.delete("/branches/{branch_id}", status_code=204)
def delete_branch(branch_id: int, user: str = Depends(current_user)):
    with get_db() as db:
        owns = db.execute(
            "SELECT id FROM branches WHERE id=? AND user_id=?", (branch_id, user)
        ).fetchone()
        if not owns:
            raise HTTPException(404, "branch not found")
        # Milestones reference the branch, so they go first. Anything already
        # anchored stays on-chain — that record is not ours to remove.
        db.execute("DELETE FROM milestones WHERE branch_id=? AND user_id=?", (branch_id, user))
        db.execute("DELETE FROM branches WHERE id=? AND user_id=?", (branch_id, user))


class PlannedMilestone(BaseModel):
    title: str
    detail: str
    day_offset: int          # days from start; lets the UI space the work out


class PlanResult(BaseModel):
    milestones: list[PlannedMilestone]


class PlanBody(BaseModel):
    brief: str


@router.post("/branches/{branch_id}/plan")
def plan(branch_id: int, body: PlanBody, user: str = Depends(current_user)):
    return _plan(branch_id, body.brief, user)


@router.post("/branches/{branch_id}/plan-file")
async def plan_from_file(
    branch_id: int,
    file: UploadFile = File(...),
    user: str = Depends(current_user),
):
    ext = Path(file.filename or "").suffix.lower()
    if ext not in PLAN_EXTS:
        raise HTTPException(422, f"file type not allowed: {ext or 'unknown'}")

    data = await file.read()
    if len(data) > MAX_BRIEF_BYTES:
        raise HTTPException(422, "file too large (max 10 MB)")

    # _extract_text reads from disk, so stage the upload in a temp file that
    # goes away regardless of how extraction ends.
    with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
        tmp.write(data)
        tmp_path = Path(tmp.name)
    try:
        text, _ = _extract_text(tmp_path, ext)
    except Exception as e:
        raise HTTPException(422, f"could not read this file: {e}")
    finally:
        tmp_path.unlink(missing_ok=True)

    if not text.strip():
        raise HTTPException(422, "no text found in that file")

    return _plan(branch_id, text, user)


def _plan(branch_id: int, brief: str, user: str):
    with get_db() as db:
        br = db.execute(
            "SELECT id,title,kind,due_at FROM branches WHERE id=? AND user_id=?",
            (branch_id, user),
        ).fetchone()
        if not br:
            raise HTTPException(404, "branch not found")
        existing = db.execute(
            "SELECT COUNT(*) FROM milestones WHERE branch_id=? AND user_id=?",
            (branch_id, user),
        ).fetchone()[0]

    body = PlanBody(brief=brief)
    prompt = (
        f"Break this {br['kind']} into 4 to 6 milestones a student works through in order.\n\n"
        f"TITLE: {br['title']}\n"
        f"BRIEF:\n{body.brief}\n\n"
        "Each milestone is a concrete piece of work that produces something writable — a draft "
        "section, a dataset, a set of notes — not a vague stage like 'do research'. The student "
        "will paste what they produced at each one, so every milestone must have a tangible "
        "output.\n\n"
        "title: short, imperative, under 60 characters.\n"
        "detail: one sentence on what to produce and what 'done' looks like.\n"
        "day_offset: days from starting, spacing the work realistically and leaving room to "
        "revise before the end."
    )

    try:
        result = parse("plan", prompt, PlanResult, user=user)
    except LLMDeclined as e:
        raise HTTPException(502, f"Could not plan this assignment: {e}")

    created = []
    with get_db() as db:
        for m in result.milestones:
            cur = db.execute(
                "INSERT INTO milestones(branch_id,user_id,title) VALUES(?,?,?) "
                "RETURNING id,branch_id,title,work_hash,context_hash,ai_assist_level,"
                "chain_commit_id,tx_hash,created_at",
                (branch_id, user, m.title),
            )
            row = _row(cur.fetchone())
            row["detail"] = m.detail
            row["day_offset"] = m.day_offset
            created.append(row)

    return {"milestones": created, "replaced_none": existing == 0}

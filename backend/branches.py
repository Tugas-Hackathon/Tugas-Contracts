from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from db import get_db
from auth import current_user
from llm import parse, LLMDeclined

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
        return parse("outline", prompt, OutlineResult).model_dump()
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
        return parse("rubric", prompt, RubricResult).model_dump()
    except LLMDeclined as e:
        raise HTTPException(502, str(e))

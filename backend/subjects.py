from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from db import get_db
from auth import current_user

router = APIRouter(prefix="/subjects")


class SubjectIn(BaseModel):
    name: str


def _row_to_dict(row) -> dict:
    return {"id": row["id"], "name": row["name"], "created_at": row["created_at"]}


@router.post("", status_code=201)
def create_subject(body: SubjectIn, user: str = Depends(current_user)):
    with get_db() as db:
        cur = db.execute(
            "INSERT INTO subjects(user_id, name) VALUES(?,?) RETURNING id,name,created_at",
            (user, body.name),
        )
        return _row_to_dict(cur.fetchone())


@router.get("")
def list_subjects(user: str = Depends(current_user)):
    with get_db() as db:
        rows = db.execute(
            "SELECT id,name,created_at FROM subjects WHERE user_id=? ORDER BY created_at DESC",
            (user,),
        ).fetchall()
    return [_row_to_dict(r) for r in rows]


@router.get("/{subject_id}")
def get_subject(subject_id: int, user: str = Depends(current_user)):
    with get_db() as db:
        row = db.execute(
            "SELECT id,name,created_at FROM subjects WHERE id=? AND user_id=?",
            (subject_id, user),
        ).fetchone()
    if not row:
        raise HTTPException(404, "not found")
    return _row_to_dict(row)


@router.delete("/{subject_id}", status_code=204)
def delete_subject(subject_id: int, user: str = Depends(current_user)):
    with get_db() as db:
        cur = db.execute(
            "DELETE FROM subjects WHERE id=? AND user_id=?", (subject_id, user)
        )
    if cur.rowcount == 0:
        raise HTTPException(404, "not found")

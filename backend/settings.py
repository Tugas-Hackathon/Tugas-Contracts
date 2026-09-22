import os
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from db import get_db
from auth import current_user

router = APIRouter(prefix="/settings")


class KeyBody(BaseModel):
    key: str


def _hint(key: str | None) -> str | None:
    """Last four characters only — enough to recognise, useless if leaked."""
    return f"…{key[-4:]}" if key and len(key) >= 4 else None


@router.get("")
def read(user: str = Depends(current_user)):
    with get_db() as db:
        row = db.execute(
            "SELECT openrouter_key FROM users WHERE address=?", (user,)
        ).fetchone()

    own = row["openrouter_key"] if row else None
    return {
        "has_own_key": bool(own),
        "key_hint": _hint(own),
        # Tells the UI whether AI works at all right now, without leaking the
        # server key's value.
        "server_key_available": bool(os.getenv("OPENROUTER_API_KEY")),
    }


@router.put("/openrouter")
def set_key(body: KeyBody, user: str = Depends(current_user)):
    key = body.key.strip()
    if not key:
        raise HTTPException(422, "key is empty")
    if not key.startswith("sk-or-"):
        raise HTTPException(422, "that doesn't look like an OpenRouter key — they start with sk-or-")

    with get_db() as db:
        db.execute("UPDATE users SET openrouter_key=? WHERE address=?", (key, user))
    return {"has_own_key": True, "key_hint": _hint(key)}


@router.delete("/openrouter", status_code=204)
def clear_key(user: str = Depends(current_user)):
    with get_db() as db:
        db.execute("UPDATE users SET openrouter_key=NULL WHERE address=?", (user,))

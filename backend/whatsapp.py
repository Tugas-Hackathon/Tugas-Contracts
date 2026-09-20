import os, json, urllib.request, urllib.error, urllib.parse
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from db import get_db
from auth import current_user

router = APIRouter(prefix="/whatsapp")


class LinkBody(BaseModel):
    chat_id: str
    chat_name: str
    focus_sender: Optional[str] = None
    focus_sender_name: Optional[str] = None

def bot_request(method: str, path: str, body: dict | None = None):
    # Read at call time: reading at import binds whatever .env held when the
    # module first loaded, which goes stale the moment the file is edited.
    bot_url = os.getenv("BOT_URL", "http://127.0.0.1:8787")
    bot_token = os.getenv("BOT_TOKEN", "")

    if not bot_token:
        raise HTTPException(503, "WhatsApp sidecar not configured (BOT_TOKEN unset)")

    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        f"{bot_url}{path}",
        data=data,
        method=method,
        headers={"Content-Type": "application/json", "x-bot-token": bot_token},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors="replace")
        raise HTTPException(e.code, detail)
    except urllib.error.URLError:
        raise HTTPException(503, "WhatsApp sidecar unreachable — is the bot service running?")


@router.post("/session")
def start_session(user: str = Depends(current_user)):
    return bot_request("POST", f"/session/{user}/start")


@router.get("/session")
def session_status(user: str = Depends(current_user)):
    return bot_request("GET", f"/session/{user}/status")


@router.get("/groups")
def list_groups(user: str = Depends(current_user)):
    return bot_request("GET", f"/session/{user}/groups")


@router.get("/senders")
def list_senders(chat_id: str, user: str = Depends(current_user)):
    return bot_request("GET", f"/session/{user}/senders?chat_id={urllib.parse.quote(chat_id)}")


@router.delete("/session", status_code=204)
def logout(user: str = Depends(current_user)):
    bot_request("POST", f"/session/{user}/logout")


@router.get("/links")
def list_links(user: str = Depends(current_user)):
    with get_db() as db:
        rows = db.execute(
            "SELECT subject_id,chat_id,chat_name,focus_sender,focus_sender_name "
            "FROM wa_links WHERE user_id=?",
            (user,),
        ).fetchall()
    return [dict(r) for r in rows]


@router.put("/links/{subject_id}")
def set_link(subject_id: int, body: LinkBody, user: str = Depends(current_user)):
    with get_db() as db:
        owns = db.execute(
            "SELECT id FROM subjects WHERE id=? AND user_id=?", (subject_id, user)
        ).fetchone()
        if not owns:
            raise HTTPException(404, "subject not found")
        db.execute(
            "INSERT INTO wa_links(user_id,subject_id,chat_id,chat_name,focus_sender,focus_sender_name) "
            "VALUES(?,?,?,?,?,?) "
            "ON CONFLICT(user_id,subject_id) DO UPDATE SET "
            "chat_id=excluded.chat_id, chat_name=excluded.chat_name, "
            "focus_sender=excluded.focus_sender, focus_sender_name=excluded.focus_sender_name",
            (user, subject_id, body.chat_id, body.chat_name, body.focus_sender, body.focus_sender_name),
        )
    return {"subject_id": subject_id, **body.model_dump()}


@router.delete("/links/{subject_id}", status_code=204)
def clear_link(subject_id: int, user: str = Depends(current_user)):
    with get_db() as db:
        cur = db.execute(
            "DELETE FROM wa_links WHERE subject_id=? AND user_id=?", (subject_id, user)
        )
    if cur.rowcount == 0:
        raise HTTPException(404, "link not found")

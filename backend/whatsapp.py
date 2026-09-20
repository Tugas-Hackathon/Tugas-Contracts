import os, json, urllib.request, urllib.error, urllib.parse
from fastapi import APIRouter, HTTPException, Depends
from auth import current_user

router = APIRouter(prefix="/whatsapp")

BOT_URL = os.getenv("BOT_URL", "http://127.0.0.1:8787")
BOT_TOKEN = os.getenv("BOT_TOKEN", "")


def _bot(method: str, path: str, body: dict | None = None):
    if not BOT_TOKEN:
        raise HTTPException(503, "WhatsApp sidecar not configured (BOT_TOKEN unset)")

    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        f"{BOT_URL}{path}",
        data=data,
        method=method,
        headers={"Content-Type": "application/json", "x-bot-token": BOT_TOKEN},
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
    return _bot("POST", f"/session/{user}/start")


@router.get("/session")
def session_status(user: str = Depends(current_user)):
    return _bot("GET", f"/session/{user}/status")


@router.get("/groups")
def list_groups(user: str = Depends(current_user)):
    return _bot("GET", f"/session/{user}/groups")


@router.get("/senders")
def list_senders(chat_id: str, user: str = Depends(current_user)):
    return _bot("GET", f"/session/{user}/senders?chat_id={urllib.parse.quote(chat_id)}")


@router.delete("/session", status_code=204)
def logout(user: str = Depends(current_user)):
    _bot("POST", f"/session/{user}/logout")

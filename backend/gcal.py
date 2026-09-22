import os, json, time, base64, secrets, urllib.parse, urllib.request, urllib.error
from pathlib import Path
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import RedirectResponse
from db import get_db
from auth import current_user
from agenda import _lookup, _span

router = APIRouter()

DATA_DIR = Path(os.getenv("DATA_DIR", "./data"))
AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events"
SCOPES = "https://www.googleapis.com/auth/calendar.events openid email"
STATE_TTL = 600            # 10 minutes to finish the consent screen
REFRESH_MARGIN = 120       # refresh a little early rather than racing expiry


def _cfg() -> tuple[str, str, str] | None:
    """None while unconfigured — every route degrades instead of erroring."""
    cid = os.getenv("GOOGLE_CLIENT_ID", "")
    secret = os.getenv("GOOGLE_CLIENT_SECRET", "")
    redirect = os.getenv("GOOGLE_REDIRECT_URI", "http://localhost:8000/auth/google/callback")
    return (cid, secret, redirect) if cid and secret else None


def _token_path(user: str) -> Path:
    return DATA_DIR / "tokens" / f"{user}.json"


def _load(user: str) -> dict | None:
    p = _token_path(user)
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return None


def _save(user: str, data: dict) -> None:
    p = _token_path(user)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(data), encoding="utf-8")


def _post_form(url: str, fields: dict) -> dict:
    body = urllib.parse.urlencode(fields).encode()
    req = urllib.request.Request(
        url, data=body, method="POST",
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read())


def _email_from_id_token(id_token: str | None) -> str | None:
    """Read the email claim without verifying — Google just handed it to us over
    TLS in a direct token exchange, and it is only used for display."""
    if not id_token or id_token.count(".") != 2:
        return None
    payload = id_token.split(".")[1]
    payload += "=" * (-len(payload) % 4)
    try:
        return json.loads(base64.urlsafe_b64decode(payload)).get("email")
    except Exception:
        return None


def _access_token(user: str) -> str:
    """Valid access token, refreshing when due. Raises 409 when reconnection
    is the only way forward, so the UI can say so rather than failing blind."""
    cfg = _cfg()
    if not cfg:
        raise HTTPException(503, "Google Calendar is not configured on this server")
    cid, secret, _ = cfg

    tok = _load(user)
    if not tok or not tok.get("refresh_token"):
        raise HTTPException(409, "Google Calendar not connected")

    if tok.get("expires_at", 0) - REFRESH_MARGIN > time.time():
        return tok["access_token"]

    try:
        fresh = _post_form(TOKEN_URL, {
            "client_id": cid,
            "client_secret": secret,
            "refresh_token": tok["refresh_token"],
            "grant_type": "refresh_token",
        })
    except urllib.error.HTTPError:
        # Google revokes refresh tokens after 7 days on a Testing-mode app, so
        # this is the expected end of a session, not an outage.
        tok["reconnect_needed"] = True
        _save(user, tok)
        raise HTTPException(409, "Google session expired — reconnect in Settings")

    tok["access_token"] = fresh["access_token"]
    tok["expires_at"] = int(time.time()) + int(fresh.get("expires_in", 3600))
    tok.pop("reconnect_needed", None)
    _save(user, tok)
    return tok["access_token"]


@router.get("/google/status")
def status(user: str = Depends(current_user)):
    if not _cfg():
        return {"configured": False, "connected": False}
    tok = _load(user)
    return {
        "configured": True,
        "connected": bool(tok and tok.get("refresh_token")),
        "email": tok.get("email") if tok else None,
        "reconnect_needed": bool(tok and tok.get("reconnect_needed")),
    }


@router.get("/auth/google/start")
def start(user: str = Depends(current_user)):
    cfg = _cfg()
    if not cfg:
        raise HTTPException(503, "Google Calendar is not configured on this server")
    cid, _, redirect = cfg

    state = secrets.token_urlsafe(24)
    with get_db() as db:
        db.execute("DELETE FROM oauth_states WHERE expires_at < ?", (int(time.time()),))
        db.execute(
            "INSERT INTO oauth_states(state,user_id,expires_at) VALUES(?,?,?)",
            (state, user, int(time.time()) + STATE_TTL),
        )

    q = urllib.parse.urlencode({
        "client_id": cid,
        "redirect_uri": redirect,
        "response_type": "code",
        "scope": SCOPES,
        "access_type": "offline",   # without this there is no refresh token
        "prompt": "consent",        # force one, even on a repeat authorisation
        "state": state,
    })
    return {"url": f"{AUTH_URL}?{q}"}


@router.get("/auth/google/callback")
def callback(code: str = "", state: str = "", error: str = ""):
    """Google redirects the browser here, so there is no bearer token — the
    state parameter is what proves which user began this flow."""
    front = os.getenv("CORS_ORIGIN", "http://localhost:5173")
    if error:
        return RedirectResponse(f"{front}/?gcal=denied")

    cfg = _cfg()
    if not cfg:
        return RedirectResponse(f"{front}/?gcal=unconfigured")
    cid, secret, redirect = cfg

    with get_db() as db:
        row = db.execute(
            "SELECT user_id, expires_at FROM oauth_states WHERE state=?", (state,)
        ).fetchone()
        if row:
            db.execute("DELETE FROM oauth_states WHERE state=?", (state,))

    if not row or row["expires_at"] < time.time():
        return RedirectResponse(f"{front}/?gcal=expired")

    try:
        tok = _post_form(TOKEN_URL, {
            "client_id": cid,
            "client_secret": secret,
            "code": code,
            "grant_type": "authorization_code",
            "redirect_uri": redirect,
        })
    except urllib.error.HTTPError:
        return RedirectResponse(f"{front}/?gcal=failed")

    user = row["user_id"]
    _save(user, {
        "access_token": tok.get("access_token"),
        "refresh_token": tok.get("refresh_token"),
        "expires_at": int(time.time()) + int(tok.get("expires_in", 3600)),
        "email": _email_from_id_token(tok.get("id_token")),
    })
    with get_db() as db:
        db.execute(
            "UPDATE users SET google_tokens_ref=? WHERE address=?",
            (str(_token_path(user)), user),
        )

    return RedirectResponse(f"{front}/?gcal=connected")


@router.delete("/google", status_code=204)
def disconnect(user: str = Depends(current_user)):
    _token_path(user).unlink(missing_ok=True)
    with get_db() as db:
        db.execute("UPDATE users SET google_tokens_ref=NULL WHERE address=?", (user,))


@router.post("/agenda/{ident}/push")
def push(ident: str, user: str = Depends(current_user)):
    """Send one agenda item to the student's own primary calendar."""
    item = _lookup(ident, user)
    token = _access_token(user)
    start_ts, end_ts = _span(item["starts_at"], item["ends_at"])

    payload = json.dumps({
        "summary": item["title"],
        "description": f'{item["subtitle"]} — via Tugas',
        "start": {"dateTime": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(start_ts))},
        "end": {"dateTime": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(end_ts))},
        # Deterministic id makes a repeat push update the same event rather
        # than littering the calendar with duplicates.
        "id": "tugas" + "".join(c for c in ident if c.isalnum()).lower(),
    }).encode()

    req = urllib.request.Request(
        EVENTS_URL, data=payload, method="POST",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            created = json.loads(r.read())
        return {"ok": True, "html_link": created.get("htmlLink")}
    except urllib.error.HTTPError as e:
        if e.code == 409:
            return {"ok": True, "already": True}
        raise HTTPException(502, f"Google rejected the event: {e.read().decode(errors='replace')[:200]}")

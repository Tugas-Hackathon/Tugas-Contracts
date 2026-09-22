import time, urllib.parse
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import Response
from pydantic import BaseModel
from typing import Optional
from db import get_db
from auth import current_user

router = APIRouter()

DEFAULT_DURATION = 3600  # an item with no end reads as one hour


class EventIn(BaseModel):
    title: str
    starts_at: int
    ends_at: Optional[int] = None
    kind: str = "event"


class DueIn(BaseModel):
    due_at: Optional[int]


def _stamp(ts: int) -> str:
    """UTC basic format — what both .ics and Google Calendar expect."""
    return time.strftime("%Y%m%dT%H%M%SZ", time.gmtime(ts))


def _span(starts_at: int, ends_at: Optional[int]) -> tuple[int, int]:
    end = ends_at or starts_at + DEFAULT_DURATION
    return starts_at, end


def _gcal(title: str, starts_at: int, ends_at: Optional[int], details: str) -> str:
    s, e = _span(starts_at, ends_at)
    q = urllib.parse.urlencode({
        "action": "TEMPLATE",
        "text": title,
        "dates": f"{_stamp(s)}/{_stamp(e)}",
        "details": details,
    })
    return f"https://calendar.google.com/calendar/render?{q}"


def _ics(uid: str, title: str, starts_at: int, ends_at: Optional[int], details: str) -> str:
    s, e = _span(starts_at, ends_at)
    # Long lines must be folded and commas/semicolons escaped or clients reject the file.
    def esc(v: str) -> str:
        return v.replace("\\", "\\\\").replace(",", "\\,").replace(";", "\\;").replace("\n", "\\n")
    return "\r\n".join([
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Tugas//Study OS//EN",
        "CALSCALE:GREGORIAN",
        "BEGIN:VEVENT",
        f"UID:{uid}@tugas",
        f"DTSTAMP:{_stamp(int(time.time()))}",
        f"DTSTART:{_stamp(s)}",
        f"DTEND:{_stamp(e)}",
        f"SUMMARY:{esc(title)}",
        f"DESCRIPTION:{esc(details)}",
        "END:VEVENT",
        "END:VCALENDAR",
        "",
    ])


def _item(kind: str, ident: str, title: str, starts_at: int,
          ends_at: Optional[int], subtitle: str) -> dict:
    return {
        "id": ident,
        "source": kind,
        "title": title,
        "subtitle": subtitle,
        "starts_at": starts_at,
        "ends_at": ends_at,
        "gcal_url": _gcal(title, starts_at, ends_at, subtitle),
        "ics_url": f"/agenda/{ident}.ics",
    }


def _lookup(ident: str, user: str) -> dict:
    """Agenda ids are prefixed so one route can serve both sources."""
    kind, _, raw = ident.partition("-")
    if not raw.isdigit():
        raise HTTPException(404, "not found")
    rid = int(raw)

    with get_db() as db:
        if kind == "event":
            r = db.execute(
                "SELECT id,title,starts_at,ends_at,kind FROM events WHERE id=? AND user_id=?",
                (rid, user),
            ).fetchone()
            if not r:
                raise HTTPException(404, "event not found")
            return _item("event", f"event-{r['id']}", r["title"], r["starts_at"],
                         r["ends_at"], r["kind"])

        if kind == "branch":
            r = db.execute(
                "SELECT b.id,b.title,b.kind,b.due_at,s.name AS subject "
                "FROM branches b JOIN subjects s ON s.id=b.subject_id "
                "WHERE b.id=? AND b.user_id=?",
                (rid, user),
            ).fetchone()
            if not r or not r["due_at"]:
                raise HTTPException(404, "deadline not found")
            return _item("branch", f"branch-{r['id']}", f"{r['title']} due",
                         r["due_at"], None, f"{r['subject']} · {r['kind']}")

    raise HTTPException(404, "not found")


@router.get("/agenda")
def agenda(user: str = Depends(current_user)):
    with get_db() as db:
        events = db.execute(
            "SELECT id,title,starts_at,ends_at,kind FROM events WHERE user_id=? ORDER BY starts_at",
            (user,),
        ).fetchall()
        deadlines = db.execute(
            "SELECT b.id,b.title,b.kind,b.due_at,s.name AS subject "
            "FROM branches b JOIN subjects s ON s.id=b.subject_id "
            "WHERE b.user_id=? AND b.due_at IS NOT NULL ORDER BY b.due_at",
            (user,),
        ).fetchall()

    items = [
        _item("event", f"event-{r['id']}", r["title"], r["starts_at"], r["ends_at"], r["kind"])
        for r in events
    ] + [
        _item("branch", f"branch-{r['id']}", f"{r['title']} due", r["due_at"], None,
              f"{r['subject']} · {r['kind']}")
        for r in deadlines
    ]
    items.sort(key=lambda i: i["starts_at"])
    return items


@router.post("/events", status_code=201)
def create_event(body: EventIn, user: str = Depends(current_user)):
    if body.ends_at is not None and body.ends_at < body.starts_at:
        raise HTTPException(422, "ends_at is before starts_at")
    with get_db() as db:
        cur = db.execute(
            "INSERT INTO events(user_id,title,starts_at,ends_at,kind) VALUES(?,?,?,?,?) "
            "RETURNING id,title,starts_at,ends_at,kind",
            (user, body.title, body.starts_at, body.ends_at, body.kind),
        )
        r = cur.fetchone()
    return _item("event", f"event-{r['id']}", r["title"], r["starts_at"], r["ends_at"], r["kind"])


@router.delete("/events/{event_id}", status_code=204)
def delete_event(event_id: int, user: str = Depends(current_user)):
    with get_db() as db:
        cur = db.execute("DELETE FROM events WHERE id=? AND user_id=?", (event_id, user))
    if cur.rowcount == 0:
        raise HTTPException(404, "event not found")


@router.put("/branches/{branch_id}/due")
def set_due(branch_id: int, body: DueIn, user: str = Depends(current_user)):
    with get_db() as db:
        cur = db.execute(
            "UPDATE branches SET due_at=? WHERE id=? AND user_id=?",
            (body.due_at, branch_id, user),
        )
    if cur.rowcount == 0:
        raise HTTPException(404, "branch not found")
    return {"branch_id": branch_id, "due_at": body.due_at}


@router.get("/agenda/{ident}.ics")
def download_ics(ident: str, user: str = Depends(current_user)):
    it = _lookup(ident, user)
    body = _ics(it["id"], it["title"], it["starts_at"], it["ends_at"], it["subtitle"])
    return Response(
        content=body,
        media_type="text/calendar; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{ident}.ics"'},
    )

import os, json, time
from pathlib import Path
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, Literal
from db import get_db
from auth import current_user
from llm import parse, LLMDeclined
from whatsapp import bot_request

router = APIRouter(prefix="/whatsapp")

DATA_DIR = Path(os.getenv("DATA_DIR", "./data"))
FETCH_LIMIT = 150

Kind = Literal["assignment", "exam", "announcement", "material", "noise"]


class Extracted(BaseModel):
    kind: Kind
    title: str
    detail: str = ""
    due_date: Optional[str] = None       # ISO date if one was stated
    topics: list[str] = []


class Batch(BaseModel):
    items: list[Extracted]


def _classify(subject_name: str, lines: list[str]) -> list[Extracted]:
    numbered = "\n".join(f"{i+1}. {t}" for i, t in enumerate(lines))
    prompt = (
        f"These are WhatsApp messages from the class group for the subject "
        f"\"{subject_name}\". Classify EVERY message, in order, returning exactly "
        f"{len(lines)} items.\n\n"
        "kind meanings:\n"
        "- assignment: coursework the student must submit\n"
        "- exam: a test, quiz or exam, including what it covers\n"
        "- announcement: class info worth keeping (venue change, deadline shift)\n"
        "- material: a reference to notes, slides or readings\n"
        "- noise: everything else — chatter, greetings, reactions, stickers\n\n"
        "Set due_date only when the message states one; use ISO format YYYY-MM-DD. "
        "Infer the year from context if it is obvious, otherwise leave due_date null. "
        "Keep title short and factual. Do not invent detail that is not present.\n\n"
        f"MESSAGES:\n{numbered}"
    )
    return parse("extract", prompt, Batch).items


def _write_context(user: str, subject_id: int, subject_name: str) -> str:
    """Per-subject markdown the tutor reads as extra grounding."""
    with get_db() as db:
        rows = db.execute(
            "SELECT raw, sender_name, sent_at, kind FROM messages "
            "WHERE user_id=? AND subject_guess=? AND kind IS NOT NULL AND kind!='noise' "
            "ORDER BY sent_at",
            (user, str(subject_id)),
        ).fetchall()

    buckets: dict[str, list] = {}
    for r in rows:
        buckets.setdefault(r["kind"], []).append(r)

    out = [f"# {subject_name} — from WhatsApp", ""]
    if not rows:
        out.append("_Nothing extracted yet._")
    for kind in ("assignment", "exam", "announcement", "material"):
        items = buckets.get(kind)
        if not items:
            continue
        out.append(f"## {kind.capitalize()}s" if kind != "material" else "## Materials")
        for r in items:
            when = time.strftime("%Y-%m-%d", time.localtime(r["sent_at"])) if r["sent_at"] else "?"
            who = r["sender_name"] or "unknown"
            out.append(f"- **{when}** ({who}) — {r['raw']}")
        out.append("")

    path = DATA_DIR / "context" / user / f"subject-{subject_id}.md"
    path.parent.mkdir(parents=True, exist_ok=True)
    text = "\n".join(out)
    path.write_text(text, encoding="utf-8")
    return text


@router.post("/sync")
def sync(user: str = Depends(current_user)):
    with get_db() as db:
        links = db.execute(
            "SELECT l.subject_id, l.chat_id, l.chat_name, l.focus_sender, s.name AS subject_name "
            "FROM wa_links l JOIN subjects s ON s.id = l.subject_id "
            "WHERE l.user_id=?",
            (user,),
        ).fetchall()

    if not links:
        raise HTTPException(422, "No groups mapped yet — map a group to a subject first")

    report = []

    for link in links:
        fetched = bot_request(
            "GET",
            f"/session/{user}/messages?chat_id={link['chat_id']}&limit={FETCH_LIMIT}",
        ) or []

        if link["focus_sender"]:
            fetched = [m for m in fetched if m["sender_id"] == link["focus_sender"]]
        fetched = [m for m in fetched if not m["from_me"] and m["body"].strip()]

        with get_db() as db:
            seen = {
                r[0] for r in db.execute(
                    "SELECT wa_msg_id FROM messages WHERE user_id=? AND wa_msg_id IS NOT NULL",
                    (user,),
                )
            }
        new = [m for m in fetched if m["id"] not in seen]

        if not new:
            report.append({
                "subject_id": link["subject_id"], "subject": link["subject_name"],
                "group": link["chat_name"], "new": 0, "kept": 0, "items": [],
            })
            continue

        try:
            items = _classify(link["subject_name"], [m["body"] for m in new])
        except LLMDeclined as e:
            raise HTTPException(502, f"AI could not classify messages: {e}")

        # A short reply can leave the model returning fewer items than sent;
        # pair positionally and drop the tail rather than mis-attributing.
        pairs = list(zip(new, items))
        kept = []

        with get_db() as db:
            for msg, item in pairs:
                db.execute(
                    "INSERT OR IGNORE INTO messages"
                    "(user_id,raw,sender,sender_name,sent_at,kind,subject_guess,wa_msg_id) "
                    "VALUES(?,?,?,?,?,?,?,?)",
                    (user, msg["body"], msg["sender_id"], msg["sender_name"],
                     msg["timestamp"], item.kind, str(link["subject_id"]), msg["id"]),
                )
                if item.kind in ("assignment", "exam"):
                    exists = db.execute(
                        "SELECT id FROM branches WHERE user_id=? AND subject_id=? AND title=?",
                        (user, link["subject_id"], item.title),
                    ).fetchone()
                    if not exists:
                        db.execute(
                            "INSERT INTO branches(subject_id,user_id,kind,title,targeted_topics) "
                            "VALUES(?,?,?,?,?)",
                            (link["subject_id"], user,
                             "exam" if item.kind == "exam" else "assignment",
                             item.title, ", ".join(item.topics) or None),
                        )
                        kept.append({"kind": item.kind, "title": item.title, "created": True})
                    else:
                        kept.append({"kind": item.kind, "title": item.title, "created": False})
                elif item.kind != "noise":
                    kept.append({"kind": item.kind, "title": item.title, "created": False})

        _write_context(user, link["subject_id"], link["subject_name"])

        report.append({
            "subject_id": link["subject_id"], "subject": link["subject_name"],
            "group": link["chat_name"], "new": len(new), "kept": len(kept), "items": kept,
        })

    return {"synced": report}


@router.get("/context/{subject_id}")
def get_context(subject_id: int, user: str = Depends(current_user)):
    with get_db() as db:
        row = db.execute(
            "SELECT name FROM subjects WHERE id=? AND user_id=?", (subject_id, user)
        ).fetchone()
    if not row:
        raise HTTPException(404, "subject not found")
    path = DATA_DIR / "context" / user / f"subject-{subject_id}.md"
    return {
        "markdown": path.read_text(encoding="utf-8") if path.exists() else "",
        "subject": row["name"],
    }

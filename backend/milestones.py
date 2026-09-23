import os, re, json
import urllib.request
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from eth_utils import keccak
from db import get_db
from auth import current_user
from llm import parse, LLMDeclined

router = APIRouter()

RPC_URL = os.getenv("RPC_URL", "https://rpc.bohr.life")
LEDGER_ADDRESS = os.getenv("LEDGER_ADDRESS", "").lower()

# MilestoneCommitted(address indexed student, uint256 indexed id,
#   bytes32 workHash, bytes32 contextHash, uint8 aiAssistLevel, uint64 timestamp)
MILESTONE_COMMITTED_TOPIC = "0x" + keccak(
    b"MilestoneCommitted(address,uint256,bytes32,bytes32,uint8,uint64)"
).hex()


class MilestoneIn(BaseModel):
    title: str


class HashBody(BaseModel):
    draft: str
    brief: str
    rubric: str
    ai_assist_level: Optional[int] = 60


class AnchoredBody(BaseModel):
    tx_hash: str


def _normalise(text: str) -> str:
    return re.sub(r"\s+", " ", text.strip().lower())


def _keccak_hex(text: str) -> str:
    return "0x" + keccak(text.encode()).hex()


def _rpc(method: str, params: list) -> dict:
    payload = json.dumps({"jsonrpc": "2.0", "method": method, "params": params, "id": 1}).encode()
    req = urllib.request.Request(RPC_URL, data=payload,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read())


def _row(r) -> dict:
    return {k: r[k] for k in r.keys()}


@router.post("/branches/{branch_id}/milestones", status_code=201)
def create_milestone(branch_id: int, body: MilestoneIn, user: str = Depends(current_user)):
    with get_db() as db:
        br = db.execute("SELECT id FROM branches WHERE id=? AND user_id=?",
                        (branch_id, user)).fetchone()
        if not br:
            raise HTTPException(404, "branch not found")
        cur = db.execute(
            "INSERT INTO milestones(branch_id,user_id,title) VALUES(?,?,?) "
            "RETURNING id,branch_id,title,work_hash,context_hash,ai_assist_level,chain_commit_id,tx_hash,created_at",
            (branch_id, user, body.title),
        )
        return _row(cur.fetchone())


@router.get("/branches/{branch_id}/milestones")
def list_milestones(branch_id: int, user: str = Depends(current_user)):
    with get_db() as db:
        br = db.execute("SELECT id FROM branches WHERE id=? AND user_id=?",
                        (branch_id, user)).fetchone()
        if not br:
            raise HTTPException(404, "branch not found")
        rows = db.execute(
            "SELECT id,branch_id,title,work_hash,context_hash,ai_assist_level,"
            "chain_commit_id,tx_hash,created_at FROM milestones "
            "WHERE branch_id=? AND user_id=? ORDER BY created_at",
            (branch_id, user),
        ).fetchall()
    return [_row(r) for r in rows]


@router.post("/milestones/{milestone_id}/hash")
def compute_hash(milestone_id: int, body: HashBody, user: str = Depends(current_user)):
    work_hash = _keccak_hex(_normalise(body.draft))
    context_hash = _keccak_hex(body.brief + "\n" + body.rubric)
    level = max(0, min(100, body.ai_assist_level or 60))

    with get_db() as db:
        cur = db.execute(
            "UPDATE milestones SET draft_text=?,work_hash=?,context_hash=?,ai_assist_level=? "
            "WHERE id=? AND user_id=?",
            (body.draft, work_hash, context_hash, level, milestone_id, user),
        )
        if cur.rowcount == 0:
            raise HTTPException(404, "milestone not found")

    return {"workHash": work_hash, "contextHash": context_hash, "aiAssistLevel": level}


@router.post("/milestones/{milestone_id}/anchored")
def anchored(milestone_id: int, body: AnchoredBody, user: str = Depends(current_user)):
    with get_db() as db:
        ms = db.execute(
            "SELECT work_hash,context_hash,ai_assist_level FROM milestones WHERE id=? AND user_id=?",
            (milestone_id, user),
        ).fetchone()
    if not ms:
        raise HTTPException(404, "milestone not found")
    if not ms["work_hash"]:
        raise HTTPException(400, "call /hash first")

    try:
        result = _rpc("eth_getTransactionReceipt", [body.tx_hash])
    except Exception as e:
        raise HTTPException(502, f"RPC error: {e}")

    receipt = result.get("result")
    if not receipt:
        raise HTTPException(400, "tx not found or not confirmed yet")
    if receipt.get("status") != "0x1":
        raise HTTPException(400, "tx reverted")

    log = next(
        (l for l in receipt.get("logs", [])
         if l.get("address", "").lower() == LEDGER_ADDRESS
         and l["topics"][0].lower() == MILESTONE_COMMITTED_TOPIC.lower()),
        None,
    )
    if not log:
        raise HTTPException(400, "MilestoneCommitted event not found in tx")

    data = bytes.fromhex(log["data"][2:])
    on_chain_work = "0x" + data[0:32].hex()
    on_chain_ctx = "0x" + data[32:64].hex()
    chain_commit_id = int(log["topics"][2], 16)

    if on_chain_work.lower() != ms["work_hash"].lower():
        raise HTTPException(400, "workHash mismatch")
    if on_chain_ctx.lower() != ms["context_hash"].lower():
        raise HTTPException(400, "contextHash mismatch")

    with get_db() as db:
        db.execute(
            "UPDATE milestones SET chain_commit_id=?,tx_hash=? WHERE id=?",
            (chain_commit_id, body.tx_hash, milestone_id),
        )

    return {"chain_commit_id": chain_commit_id, "tx_hash": body.tx_hash}


class PolishBody(BaseModel):
    draft: str
    instruction: Optional[str] = None      # "more academic", "shorter", …


class PolishResult(BaseModel):
    polished: str
    changes: list[str]                     # what was improved, for the student to see
    added_nothing: bool                    # the model's own attestation


@router.post("/milestones/{milestone_id}/polish")
def polish(milestone_id: int, body: PolishBody, user: str = Depends(current_user)):
    """Improve how the student said it. Never change what they said."""
    if not body.draft.strip():
        raise HTTPException(422, "write your rough notes first")

    with get_db() as db:
        ms = db.execute(
            "SELECT m.title, b.title AS branch_title FROM milestones m "
            "JOIN branches b ON b.id = m.branch_id WHERE m.id=? AND m.user_id=?",
            (milestone_id, user),
        ).fetchone()
    if not ms:
        raise HTTPException(404, "milestone not found")

    extra = f"\n\nThe student also asks: {body.instruction}" if body.instruction else ""

    prompt = (
        "A student has written rough notes for a piece of coursework. Rewrite them so they read "
        "as clear, well-structured academic prose.\n\n"
        "ABSOLUTE CONSTRAINT — the ideas must stay entirely the student's:\n"
        "- Do NOT add facts, examples, statistics, citations or arguments that are not already "
        "in their notes. Not one.\n"
        "- Do NOT extend their reasoning or draw conclusions they did not draw.\n"
        "- If they made three points, the result has three points. Never four.\n"
        "- If a point is thin, leave it thin. Do not pad it out with invented substance.\n\n"
        "What you MAY do: fix grammar and spelling, turn fragments into sentences, order their "
        "points logically, improve transitions, replace casual phrasing with academic register, "
        "remove repetition.\n\n"
        "You are a copy editor, not a co-author.\n\n"
        f"ASSIGNMENT: {ms['branch_title']}\n"
        f"SECTION: {ms['title']}{extra}\n\n"
        f"THE STUDENT'S NOTES:\n{body.draft}\n\n"
        "changes: list what you improved, phrased for the student — 'joined your second and "
        "third points into one paragraph', not 'improved flow'.\n"
        "added_nothing: true only if you introduced no new content whatsoever."
    )

    try:
        result = parse("polish", prompt, PolishResult, user=user)
    except LLMDeclined as e:
        raise HTTPException(502, f"Could not rewrite that: {e}")

    return result.model_dump()

import json, time, tempfile
from pathlib import Path
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from pydantic import BaseModel
from db import get_db
from auth import current_user
from llm import parse, LLMDeclined
from materials import _extract_text

router = APIRouter()

PAPER_EXTS = {".pdf", ".docx", ".txt", ".md"}
MAX_PAPER_BYTES = 10 * 1024 * 1024
EMA_ALPHA = 0.3


class Question(BaseModel):
    topic: str
    question: str
    options: list[str]
    answer_index: int
    explanation: str


class StudyStep(BaseModel):
    topic: str
    why: str


class ExamPrep(BaseModel):
    study_plan: list[StudyStep]
    questions: list[Question]


class PaperBody(BaseModel):
    paper: str


class AttemptBody(BaseModel):
    answers: list[int]     # one chosen option index per question, -1 for skipped


def _build(branch_id: int, source: str, user: str):
    with get_db() as db:
        br = db.execute(
            "SELECT id,title,kind FROM branches WHERE id=? AND user_id=?",
            (branch_id, user),
        ).fetchone()
    if not br:
        raise HTTPException(404, "branch not found")

    prompt = (
        f"A student is revising for: {br['title']}.\n\n"
        "Below is their past-year paper or topic list. Produce two things.\n\n"
        "study_plan: the topics to revise, hardest or highest-weight first, each with one "
        "sentence on why it matters for this paper.\n\n"
        "questions: 8 multiple-choice questions that rehearse the same understanding the paper "
        "tests. Do not copy its questions verbatim — a student who memorises the answers should "
        "still fail a reworded version. Exactly 4 options each, one correct, answer_index "
        "0-based. The explanation states why the right answer is right, so a wrong attempt "
        "teaches something.\n\n"
        f"PAPER / TOPICS:\n{source[:12000]}"
    )

    try:
        result = parse("quiz", prompt, ExamPrep)
    except LLMDeclined as e:
        raise HTTPException(502, f"Could not build a quiz from that: {e}")

    if not result.questions:
        raise HTTPException(502, "No questions could be generated from that paper")

    with get_db() as db:
        cur = db.execute(
            "INSERT INTO quizzes(branch_id,user_id,questions,study_plan) VALUES(?,?,?,?) "
            "RETURNING id,created_at",
            (branch_id, user,
             json.dumps([q.model_dump() for q in result.questions]),
             json.dumps([s.model_dump() for s in result.study_plan])),
        )
        row = cur.fetchone()

    return {
        "quiz_id": row["id"],
        "study_plan": [s.model_dump() for s in result.study_plan],
        "questions": _strip_answers(result.questions),
    }


def _strip_answers(questions) -> list[dict]:
    """The browser must never receive answer_index — it is scored server-side."""
    out = []
    for i, q in enumerate(questions):
        d = q.model_dump() if hasattr(q, "model_dump") else dict(q)
        out.append({"n": i, "topic": d["topic"], "question": d["question"], "options": d["options"]})
    return out


@router.post("/branches/{branch_id}/quiz")
def make_quiz(branch_id: int, body: PaperBody, user: str = Depends(current_user)):
    if not body.paper.strip():
        raise HTTPException(422, "paste the paper or a topic list first")
    return _build(branch_id, body.paper, user)


@router.post("/branches/{branch_id}/quiz-file")
async def make_quiz_from_file(
    branch_id: int,
    file: UploadFile = File(...),
    user: str = Depends(current_user),
):
    ext = Path(file.filename or "").suffix.lower()
    if ext not in PAPER_EXTS:
        raise HTTPException(422, f"file type not allowed: {ext or 'unknown'}")

    data = await file.read()
    if len(data) > MAX_PAPER_BYTES:
        raise HTTPException(422, "file too large (max 10 MB)")

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
    return _build(branch_id, text, user)


@router.get("/branches/{branch_id}/quiz")
def get_quiz(branch_id: int, user: str = Depends(current_user)):
    with get_db() as db:
        row = db.execute(
            "SELECT id,questions,study_plan FROM quizzes WHERE branch_id=? AND user_id=? "
            "ORDER BY created_at DESC LIMIT 1",
            (branch_id, user),
        ).fetchone()
        if not row:
            return {"quiz_id": None, "study_plan": [], "questions": []}
        attempts = db.execute(
            "SELECT score,created_at FROM quiz_attempts WHERE branch_id=? AND user_id=? "
            "ORDER BY created_at DESC LIMIT 5",
            (branch_id, user),
        ).fetchall()

    return {
        "quiz_id": row["id"],
        "study_plan": json.loads(row["study_plan"] or "[]"),
        "questions": _strip_answers(json.loads(row["questions"])),
        "attempts": [dict(a) for a in attempts],
    }


@router.post("/branches/{branch_id}/quiz/attempt")
def submit(branch_id: int, body: AttemptBody, user: str = Depends(current_user)):
    with get_db() as db:
        row = db.execute(
            "SELECT questions FROM quizzes WHERE branch_id=? AND user_id=? "
            "ORDER BY created_at DESC LIMIT 1",
            (branch_id, user),
        ).fetchone()
    if not row:
        raise HTTPException(404, "no quiz for this branch yet")

    questions = json.loads(row["questions"])
    if len(body.answers) != len(questions):
        raise HTTPException(422, f"expected {len(questions)} answers, got {len(body.answers)}")

    results, correct = [], 0
    per_topic: dict[str, list[int]] = {}

    for i, (q, chosen) in enumerate(zip(questions, body.answers)):
        ok = chosen == q["answer_index"]
        correct += ok
        per_topic.setdefault(q["topic"], []).append(1 if ok else 0)
        results.append({
            "n": i,
            "correct": ok,
            "chosen": chosen,
            "answer_index": q["answer_index"],
            "explanation": q["explanation"],
        })

    score = correct / len(questions)
    now = int(time.time())

    with get_db() as db:
        db.execute(
            "INSERT INTO quiz_attempts(branch_id,user_id,answers,score) VALUES(?,?,?,?)",
            (branch_id, user, json.dumps(body.answers), score),
        )
        # Smooth mastery per topic so one lucky or careless run does not swing it.
        for topic, marks in per_topic.items():
            hit = sum(marks) / len(marks)
            prev = db.execute(
                "SELECT mastery FROM topic_mastery WHERE branch_id=? AND user_id=? AND topic=?",
                (branch_id, user, topic),
            ).fetchone()
            if prev:
                blended = prev["mastery"] + EMA_ALPHA * (hit - prev["mastery"])
                db.execute(
                    "UPDATE topic_mastery SET mastery=?,updated_at=? "
                    "WHERE branch_id=? AND user_id=? AND topic=?",
                    (blended, now, branch_id, user, topic),
                )
            else:
                db.execute(
                    "INSERT INTO topic_mastery(branch_id,user_id,topic,mastery,updated_at) "
                    "VALUES(?,?,?,?,?)",
                    (branch_id, user, topic, hit, now),
                )

        mastery = db.execute(
            "SELECT topic,mastery FROM topic_mastery WHERE branch_id=? AND user_id=? "
            "ORDER BY mastery ASC",
            (branch_id, user),
        ).fetchall()

    return {
        "score": score,
        "correct": correct,
        "total": len(questions),
        "results": results,
        "mastery": [dict(m) for m in mastery],
    }

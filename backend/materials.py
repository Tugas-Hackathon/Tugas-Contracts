import os, uuid, mimetypes
from pathlib import Path
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from fastapi.responses import FileResponse
from db import get_db
from auth import current_user

router = APIRouter()

ALLOWED_EXTS = {".pdf", ".pptx", ".docx", ".txt", ".md", ".png", ".jpg", ".jpeg"}
MAX_BYTES = 25 * 1024 * 1024  # 25 MB
DATA_DIR = Path(os.getenv("DATA_DIR", "./data"))


def _extract_text(path: Path, ext: str) -> tuple[str, int]:
    if ext in {".txt", ".md"}:
        return path.read_text(errors="replace"), 1

    if ext == ".pdf":
        from pypdf import PdfReader
        reader = PdfReader(path)
        pages = [p.extract_text() or "" for p in reader.pages]
        return "\n".join(pages), len(pages)

    if ext == ".pptx":
        from pptx import Presentation
        prs = Presentation(path)
        slides = [
            " ".join(shape.text for shape in slide.shapes if shape.has_text_frame)
            for slide in prs.slides
        ]
        return "\n".join(slides), len(slides)

    if ext == ".docx":
        from docx import Document
        doc = Document(path)
        return "\n".join(p.text for p in doc.paragraphs), 1

    if ext in {".png", ".jpg", ".jpeg"}:
        # ponytail: OCR via vision model; images with no text return empty
        from llm import parse, LLMDeclined
        from pydantic import BaseModel

        class OCRResult(BaseModel):
            text: str

        try:
            result = parse("ocr", f"Extract all text from this image. File: {path.name}", OCRResult)
            return result.text, 1
        except (LLMDeclined, FileNotFoundError):
            return "", 1

    return "", 1


@router.post("/subjects/{subject_id}/materials", status_code=201)
async def upload_material(
    subject_id: int,
    file: UploadFile = File(...),
    user: str = Depends(current_user),
):
    with get_db() as db:
        row = db.execute(
            "SELECT id FROM subjects WHERE id=? AND user_id=?", (subject_id, user)
        ).fetchone()
    if not row:
        raise HTTPException(404, "subject not found")

    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_EXTS:
        raise HTTPException(422, f"file type not allowed: {ext}")

    data = await file.read()
    if len(data) > MAX_BYTES:
        raise HTTPException(422, "file too large (max 25 MB)")

    dest_dir = DATA_DIR / "files" / user / str(subject_id)
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / f"{uuid.uuid4()}{ext}"
    dest.write_bytes(data)

    try:
        text, pages = _extract_text(dest, ext)
    except Exception:
        text, pages = "", 0

    if not text.strip():
        dest.unlink(missing_ok=True)
        raise HTTPException(422, "could not extract any text from this file")

    mime = file.content_type or mimetypes.guess_type(file.filename or "")[0] or "application/octet-stream"

    with get_db() as db:
        cur = db.execute(
            "INSERT INTO materials(subject_id,user_id,filename,filepath,mime,text,page_count) "
            "VALUES(?,?,?,?,?,?,?) RETURNING id,filename,mime,page_count,created_at",
            (subject_id, user, file.filename, str(dest), mime, text, pages),
        )
        mat = cur.fetchone()

    return {
        "id": mat["id"],
        "filename": mat["filename"],
        "mime": mat["mime"],
        "page_count": mat["page_count"],
        "created_at": mat["created_at"],
    }


@router.get("/subjects/{subject_id}/materials")
def list_materials(subject_id: int, user: str = Depends(current_user)):
    with get_db() as db:
        row = db.execute(
            "SELECT id FROM subjects WHERE id=? AND user_id=?", (subject_id, user)
        ).fetchone()
        if not row:
            raise HTTPException(404, "subject not found")
        rows = db.execute(
            "SELECT id,filename,mime,page_count,created_at FROM materials "
            "WHERE subject_id=? AND user_id=? ORDER BY created_at DESC",
            (subject_id, user),
        ).fetchall()
    return [dict(r) for r in rows]


@router.get("/materials/{material_id}/download")
def download_material(material_id: int, user: str = Depends(current_user)):
    with get_db() as db:
        row = db.execute(
            "SELECT filename,filepath,mime FROM materials WHERE id=? AND user_id=?",
            (material_id, user),
        ).fetchone()
    if not row:
        raise HTTPException(404, "material not found")
    path = Path(row["filepath"])
    if not path.exists():
        raise HTTPException(404, "file missing on disk")
    return FileResponse(path, media_type=row["mime"], filename=row["filename"])


@router.delete("/materials/{material_id}", status_code=204)
def delete_material(material_id: int, user: str = Depends(current_user)):
    with get_db() as db:
        row = db.execute(
            "SELECT filepath FROM materials WHERE id=? AND user_id=?",
            (material_id, user),
        ).fetchone()
        if not row:
            raise HTTPException(404, "material not found")
        db.execute("DELETE FROM materials WHERE id=?", (material_id,))
    Path(row["filepath"]).unlink(missing_ok=True)

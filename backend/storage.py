import os, json, urllib.request, urllib.error, urllib.parse
from pathlib import Path

# Supabase Storage in production, local disk otherwise. Vercel's filesystem is
# ephemeral, so an uploaded PDF written to disk there is gone by the next
# request.
SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")
BUCKET = os.getenv("SUPABASE_BUCKET", "materials")
REMOTE = bool(SUPABASE_URL and SUPABASE_KEY)

DATA_DIR = Path(os.getenv("DATA_DIR", "./data"))


def _url(key: str) -> str:
    return f"{SUPABASE_URL}/storage/v1/object/{BUCKET}/{urllib.parse.quote(key)}"


def _headers(extra: dict | None = None) -> dict:
    h = {"Authorization": f"Bearer {SUPABASE_KEY}", "apikey": SUPABASE_KEY}
    h.update(extra or {})
    return h


def put(key: str, data: bytes, content_type: str = "application/octet-stream") -> str:
    """Store bytes, returning the reference to persist alongside the row."""
    if not REMOTE:
        dest = DATA_DIR / "files" / key
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(data)
        return str(dest)

    req = urllib.request.Request(
        _url(key), data=data, method="POST",
        headers=_headers({"Content-Type": content_type, "x-upsert": "true"}),
    )
    try:
        with urllib.request.urlopen(req, timeout=60):
            pass
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"upload failed: {e.read().decode(errors='replace')[:200]}")
    return f"supabase://{BUCKET}/{key}"


def get(ref: str) -> bytes:
    if not ref.startswith("supabase://"):
        return Path(ref).read_bytes()

    key = ref.split("/", 3)[3]
    req = urllib.request.Request(_url(key), headers=_headers())
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.read()
    except urllib.error.HTTPError as e:
        raise FileNotFoundError(f"not in storage: {e.code}")


def delete(ref: str) -> None:
    if not ref.startswith("supabase://"):
        Path(ref).unlink(missing_ok=True)
        return

    key = ref.split("/", 3)[3]
    req = urllib.request.Request(_url(key), method="DELETE", headers=_headers())
    try:
        with urllib.request.urlopen(req, timeout=30):
            pass
    except urllib.error.HTTPError:
        pass  # already gone is the desired end state

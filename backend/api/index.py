# Vercel entry point. Its Python runtime imports `app` from this module and
# serves it; nothing here runs locally, where uvicorn loads main:app directly.
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from main import app  # noqa: E402

__all__ = ["app"]

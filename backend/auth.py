import secrets, time
from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from eth_account import Account
from eth_account.messages import encode_defunct
from db import get_db

router = APIRouter(prefix="/auth")
bearer = HTTPBearer()

NONCE_TTL = 300      # 5 minutes
TOKEN_TTL = 2592000  # 30 days


def _make_nonce() -> str:
    return f"Sign in to Tugas: {secrets.token_hex(16)}"


class VerifyBody(BaseModel):
    address: str
    signature: str


@router.get("/nonce")
def get_nonce(address: str):
    address = address.lower()
    nonce = _make_nonce()
    expires = int(time.time()) + NONCE_TTL
    with get_db() as db:
        db.execute(
            "INSERT INTO nonces(address,nonce,expires_at) VALUES(?,?,?) "
            "ON CONFLICT(address) DO UPDATE SET nonce=excluded.nonce, expires_at=excluded.expires_at",
            (address, nonce, expires),
        )
    return {"nonce": nonce}


@router.post("/verify")
def verify(body: VerifyBody):
    address = body.address.lower()
    with get_db() as db:
        row = db.execute(
            "SELECT nonce, expires_at FROM nonces WHERE address=?", (address,)
        ).fetchone()
        if not row:
            raise HTTPException(401, "no nonce")
        if int(time.time()) > row["expires_at"]:
            db.execute("DELETE FROM nonces WHERE address=?", (address,))
            raise HTTPException(401, "nonce expired")

        try:
            msg = encode_defunct(text=row["nonce"])
            recovered = Account.recover_message(msg, signature=body.signature).lower()
        except Exception:
            raise HTTPException(401, "bad signature")
        if recovered != address:
            raise HTTPException(401, "signer mismatch")

        db.execute("DELETE FROM nonces WHERE address=?", (address,))
        db.execute(
            "INSERT INTO users(address) VALUES(?) ON CONFLICT DO NOTHING", (address,)
        )

        token = secrets.token_urlsafe(32)
        expires = int(time.time()) + TOKEN_TTL
        db.execute(
            "INSERT INTO sessions(token,user_id,expires_at) VALUES(?,?,?)",
            (token, address, expires),
        )
    return {"token": token, "address": address}


def current_user(credentials: HTTPAuthorizationCredentials = Depends(bearer)) -> str:
    token = credentials.credentials
    with get_db() as db:
        row = db.execute(
            "SELECT user_id, expires_at FROM sessions WHERE token=?", (token,)
        ).fetchone()
    if not row or int(time.time()) > row["expires_at"]:
        raise HTTPException(401, "invalid token")
    return row["user_id"]

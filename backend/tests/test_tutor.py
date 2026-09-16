import os, sys, io
os.environ.setdefault("DATA_DIR", "/tmp/tugas-test")
os.environ.setdefault("LLM_FIXTURES", "1")
sys.path.insert(0, str(__import__("pathlib").Path(__file__).parent.parent))

from eth_account import Account
from eth_account.messages import encode_defunct
from fastapi.testclient import TestClient
from main import app
from db import init_db

init_db()
client = TestClient(app)


def _login():
    w = Account.create()
    r = client.get(f"/auth/nonce?address={w.address}")
    nonce = r.json()["nonce"]
    msg = encode_defunct(text=nonce)
    sig = w.sign_message(msg).signature.hex()
    return client.post("/auth/verify", json={"address": w.address, "signature": "0x" + sig}).json()["token"]


def _setup():
    token = _login()
    sid = client.post("/subjects", json={"name": "DBMS"},
                      headers={"Authorization": f"Bearer {token}"}).json()["id"]
    notes = b"A primary key uniquely identifies each row in a table. It cannot be NULL and must be unique."
    client.post(f"/subjects/{sid}/materials",
                files={"file": ("notes.txt", io.BytesIO(notes), "text/plain")},
                headers={"Authorization": f"Bearer {token}"})
    return token, sid


def test_ask_returns_answer():
    token, sid = _setup()
    r = client.post(f"/subjects/{sid}/ask",
                    json={"question": "What is a primary key?"},
                    headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    data = r.json()
    assert "answer" in data
    assert isinstance(data["citations"], list)


def test_citations_have_required_fields():
    token, sid = _setup()
    r = client.post(f"/subjects/{sid}/ask",
                    json={"question": "What is a primary key?"},
                    headers={"Authorization": f"Bearer {token}"})
    for c in r.json()["citations"]:
        assert "chunk_id" in c
        assert "quote" in c


def test_ask_empty_subject_returns_422():
    token = _login()
    sid = client.post("/subjects", json={"name": "Empty"},
                      headers={"Authorization": f"Bearer {token}"}).json()["id"]
    r = client.post(f"/subjects/{sid}/ask",
                    json={"question": "anything"},
                    headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 422


def test_invalid_citations_dropped():
    token, sid = _setup()
    r = client.post(f"/subjects/{sid}/ask",
                    json={"question": "What is a primary key?"},
                    headers={"Authorization": f"Bearer {token}"})
    chunk_ids = {c["chunk_id"] for c in r.json()["citations"]}
    for cid in chunk_ids:
        assert cid.startswith("M"), f"unexpected chunk_id: {cid}"
